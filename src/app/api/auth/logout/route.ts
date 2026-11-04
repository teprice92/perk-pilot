import { authEnabled } from "@/lib/server/auth/config";
import { withCookies } from "@/lib/server/auth/respond";
import { clearSessionCookie, destroySession } from "@/lib/server/auth/session";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!authEnabled()) return Response.json({ ok: true });
    assertSameOrigin(req);
    const body = (await readJson(req, 1024).catch(() => ({}))) as { everywhere?: boolean };
    await destroySession(req, Boolean(body?.everywhere));
    return withCookies({ ok: true }, [clearSessionCookie(req)]);
  } catch (e) {
    return errorResponse(e);
  }
}
