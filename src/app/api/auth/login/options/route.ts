import { assertAuthConfigured, authEnabled } from "@/lib/server/auth/config";
import { saveChallenge } from "@/lib/server/auth/challenge";
import { authenticationOptions } from "@/lib/server/auth/passkeys";
import { withCookies } from "@/lib/server/auth/respond";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/server/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!authEnabled()) throw new HttpError(404, "Not found");
    assertAuthConfigured();
    assertSameOrigin(req);
    const rl = rateLimit(clientKey(req, "auth"), 20);
    if (!rl.ok) return tooMany(rl.resetAt);
    const options = await authenticationOptions(req);
    return withCookies({ options }, [await saveChallenge(req, "login", options.challenge, {})]);
  } catch (e) {
    return errorResponse(e);
  }
}
