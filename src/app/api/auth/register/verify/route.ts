import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { assertAuthConfigured, authEnabled } from "@/lib/server/auth/config";
import { clearChallengeCookie, takeChallenge } from "@/lib/server/auth/challenge";
import { verifyRegistration } from "@/lib/server/auth/passkeys";
import { withCookies } from "@/lib/server/auth/respond";
import { createSession } from "@/lib/server/auth/session";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";
import type { RegisterData } from "@/lib/server/auth/passkeys";

export const runtime = "nodejs";

/** Step 2: verify the new passkey, then create the user (and household) atomically. */
export async function POST(req: Request) {
  try {
    if (!authEnabled()) throw new HttpError(404, "Not found");
    assertAuthConfigured();
    assertSameOrigin(req);
    const rl = rateLimit(clientKey(req, "auth"), 20);
    if (!rl.ok) return tooMany(rl.resetAt);
    const body = (await readJson(req, 32 * 1024)) as { response?: RegistrationResponseJSON };
    if (!body?.response) throw new HttpError(422, "Missing passkey response");
    const { challenge, data } = await takeChallenge<RegisterData>(req, "register");
    const passkey = await verifyRegistration(req, body.response, challenge);
    const db = getDb()!;

    const user = await db.$transaction(async (tx) => {
      let role = "member";
      let aiEnabled = false;
      let householdId: string | null = null;
      if (data.kind === "setup") {
        // Re-check inside the transaction so two simultaneous setups can't both become owner.
        if ((await tx.user.count({ where: { role: "owner" } })) > 0) throw new HttpError(409, "The owner account already exists");
        role = "owner";
        aiEnabled = true;
      } else if (data.kind === "invite") {
        const invite = await tx.invite.findUnique({ where: { id: data.inviteId! }, include: { createdBy: true } });
        if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) throw new HttpError(403, "This invite link is invalid, used or expired");
        const claimed = await tx.invite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date(), usedById: data.userId } });
        if (claimed.count !== 1) throw new HttpError(409, "This invite was just used");
        aiEnabled = invite.aiEnabled;
        if (invite.joinHousehold) householdId = invite.createdBy.householdId;
      }
      if (!householdId) {
        const h = await tx.household.create({ data: { name: `${data.name}'s household`, preferences: {}, valuations: {} } });
        householdId = h.id;
      }
      const u = await tx.user.create({ data: { id: data.userId, name: data.name, email: data.email, role, aiEnabled, householdId } });
      if (!(await tx.household.findUnique({ where: { id: householdId } }))?.ownerId) await tx.household.update({ where: { id: householdId }, data: { ownerId: u.id } });
      await tx.passkey.create({ data: { ...passkey, userId: u.id } });
      return u;
    });

    const session = await createSession(user.id, req);
    return withCookies({ ok: true, user: { id: user.id, name: user.name, role: user.role, aiEnabled: user.aiEnabled } }, [session, clearChallengeCookie(req)]);
  } catch (e) {
    return errorResponse(e);
  }
}
