import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { assertAuthConfigured, authEnabled } from "@/lib/server/auth/config";
import { clearChallengeCookie, takeChallenge } from "@/lib/server/auth/challenge";
import { verifyAuthentication } from "@/lib/server/auth/passkeys";
import { withCookies } from "@/lib/server/auth/respond";
import { createSession } from "@/lib/server/auth/session";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!authEnabled()) throw new HttpError(404, "Not found");
    assertAuthConfigured();
    assertSameOrigin(req);
    const rl = rateLimit(clientKey(req, "auth"), 20);
    if (!rl.ok) return tooMany(rl.resetAt);
    const body = (await readJson(req, 32 * 1024)) as { response?: AuthenticationResponseJSON };
    if (!body?.response?.id) throw new HttpError(422, "Missing passkey response");
    const { challenge } = await takeChallenge(req, "login");
    const user = await verifyAuthentication(req, body.response, challenge);
    const session = await createSession(user.id, req);
    return withCookies({ ok: true, user: { id: user.id, name: user.name, role: user.role, aiEnabled: user.aiEnabled } }, [session, clearChallengeCookie(req)]);
  } catch (e) {
    return errorResponse(e);
  }
}
