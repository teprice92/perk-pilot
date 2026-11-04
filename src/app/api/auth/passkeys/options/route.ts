import { saveChallenge } from "@/lib/server/auth/challenge";
import { requireUser } from "@/lib/server/auth/guard";
import { registrationOptions } from "@/lib/server/auth/passkeys";
import { withCookies } from "@/lib/server/auth/respond";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/server/request";

export const runtime = "nodejs";

/** Add another passkey (e.g. a second device) to the signed-in account. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    if (!user) throw new HttpError(404, "Not found");
    const rl = rateLimit(clientKey(req, "auth"), 20);
    if (!rl.ok) return tooMany(rl.resetAt);
    const existing = await getDb()!.passkey.findMany({ where: { userId: user.id }, select: { id: true, transports: true } });
    if (existing.length >= 10) throw new HttpError(409, "You already have 10 passkeys");
    const options = await registrationOptions(req, user, existing);
    return withCookies({ options }, [await saveChallenge(req, "add-passkey", options.challenge, { userId: user.id })]);
  } catch (e) {
    return errorResponse(e);
  }
}
