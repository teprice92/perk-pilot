import "server-only";

/**
 * Request hardening helpers shared by API routes.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Read and parse a JSON body with a hard byte cap. Enforced while streaming,
 * so a missing or false Content-Length (e.g. chunked uploads) can't bypass it.
 */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "Request body too large");
  if (!req.body) throw new HttpError(400, "Missing request body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/**
 * Reject cross-site browser requests. Browsers always send `Origin` (and
 * modern ones `Sec-Fetch-Site`) on cross-origin POSTs, so another website
 * can't drive this API from a visitor's browser. Non-browser clients are
 * governed by rate limits and budgets instead.
 */
export function assertSameOrigin(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Cross-site requests are not allowed");
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const o = new URL(origin);
    if (o.host === host || allowed.includes(o.origin)) return;
  } catch {
    // fall through
  }
  throw new HttpError(403, "Cross-site requests are not allowed");
}

/**
 * Recognise setup problems (database schema not pushed, database unreachable)
 * so the owner sees an actionable message instead of a bare 500. Messages
 * name the fix, never connection strings or query details.
 */
export function setupProblem(e: unknown): string | null {
  const err = e as { code?: unknown; message?: unknown; cause?: unknown } | null;
  if (!err || typeof err !== "object") return null;
  const code = typeof err.code === "string" ? err.code : "";
  const text = `${typeof err.message === "string" ? err.message : ""} ${String((err.cause as { message?: unknown } | undefined)?.message ?? "")}`;
  // P2021/P2022 = table/column missing; 42P01/42703 = the same from Postgres via the driver adapter.
  if (["P2021", "P2022"].includes(code) || /42P01|42703|does not exist in the current database|relation .* does not exist|column .* does not exist/i.test(text))
    return "The database tables are missing or out of date. Run `npx prisma db push` against your database with the latest code, then try again.";
  if (["P1000", "P1001", "P1002", "P1017"].includes(code) || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Can't reach database|password authentication failed|28P01/i.test(text))
    return "Can't connect to the database. Check DATABASE_URL in your hosting settings and redeploy.";
  return null;
}

export function errorResponse(e: unknown, fallback = "Something went wrong"): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  const setup = setupProblem(e);
  if (setup) {
    console.error("[perkpilot] setup problem:", setup, e);
    return Response.json({ error: setup }, { status: 503 });
  }
  console.error("[perkpilot] unhandled API error", e);
  return Response.json({ error: fallback }, { status: 500 });
}
