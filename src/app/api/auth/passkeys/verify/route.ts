import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { clearChallengeCookie, takeChallenge } from "@/lib/server/auth/challenge";
import { requireUser } from "@/lib/server/auth/guard";
import { verifyRegistration } from "@/lib/server/auth/passkeys";
import { withCookies } from "@/lib/server/auth/respond";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    if (!user) throw new HttpError(404, "Not found");
    const body = (await readJson(req, 32 * 1024)) as { response?: RegistrationResponseJSON };
    if (!body?.response) throw new HttpError(422, "Missing passkey response");
    const { challenge, data } = await takeChallenge<{ userId: string }>(req, "add-passkey");
    if (data.userId !== user.id) throw new HttpError(403, "This passkey request belongs to another account");
    const pk = await verifyRegistration(req, body.response, challenge);
    await getDb()!.passkey.create({ data: { ...pk, userId: user.id } });
    return withCookies({ ok: true, name: pk.name }, [clearChallengeCookie(req)]);
  } catch (e) {
    return errorResponse(e);
  }
}
