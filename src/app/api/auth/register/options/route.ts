import { z } from "zod";
import { assertAuthConfigured, authEnabled, setupCode, signupMode } from "@/lib/server/auth/config";
import { saveChallenge } from "@/lib/server/auth/challenge";
import { registrationOptions } from "@/lib/server/auth/passkeys";
import { withCookies } from "@/lib/server/auth/respond";
import { newToken, safeEqual, sha256 } from "@/lib/server/auth/tokens";
import { getDb } from "@/lib/server/db";
import type { RegisterData } from "@/lib/server/auth/passkeys";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  setupCode: z.string().max(200).optional(),
  invite: z.string().max(200).optional(),
});


/**
 * Step 1 of account creation. Who may create an account:
 *  - the very first user (the owner), with PERKPILOT_SETUP_CODE;
 *  - anyone holding a valid, unused invite;
 *  - anyone, only when PERKPILOT_SIGNUP=open (AI stays off until the owner enables it).
 */
export async function POST(req: Request) {
  try {
    if (!authEnabled()) throw new HttpError(404, "Not found");
    assertAuthConfigured();
    assertSameOrigin(req);
    const rl = rateLimit(clientKey(req, "auth"), 20);
    if (!rl.ok) return tooMany(rl.resetAt);
    const parsed = Body.safeParse(await readJson(req, 8 * 1024));
    if (!parsed.success) throw new HttpError(422, "Please enter your name");
    const { name, email, setupCode: code, invite } = parsed.data;
    const db = getDb()!;

    let kind: RegisterData["kind"];
    let inviteId: string | undefined;
    const hasOwner = (await db.user.count({ where: { role: "owner" } })) > 0;
    if (!hasOwner) {
      const expected = setupCode();
      if (!expected) throw new HttpError(503, "Set PERKPILOT_SETUP_CODE (16+ characters) to create the owner account");
      if (!code || !safeEqual(code, expected)) throw new HttpError(403, "That setup code isn't right");
      kind = "setup";
    } else if (invite) {
      const row = await db.invite.findUnique({ where: { codeHash: sha256(invite) } });
      if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) throw new HttpError(403, "This invite link is invalid, used or expired");
      kind = "invite";
      inviteId = row.id;
    } else if (signupMode() === "open") {
      kind = "open";
    } else {
      throw new HttpError(403, "PerkPilot is invite-only. Ask the owner for an invite link.");
    }
    if (email && (await db.user.findUnique({ where: { email } }))) throw new HttpError(409, "That email is already used by another account");

    const userId = `u_${newToken(12)}`;
    const options = await registrationOptions(req, { id: userId, name, email: email || null });
    const data: RegisterData = { userId, name, email: email || null, kind, ...(inviteId ? { inviteId } : {}) };
    const setCookie = await saveChallenge(req, "register", options.challenge, data as never);
    return withCookies({ options }, [setCookie]);
  } catch (e) {
    return errorResponse(e);
  }
}
