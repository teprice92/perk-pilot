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

export function errorResponse(e: unknown, fallback = "Something went wrong"): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error("[perkpilot] unhandled API error", e);
  return Response.json({ error: fallback }, { status: 500 });
}
