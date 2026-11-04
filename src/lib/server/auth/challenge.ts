import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/server/db";
import { HttpError } from "@/lib/server/request";
import { relyingParty } from "./config";
import { CHALLENGE_COOKIE, cookie, newToken, readCookie, sign, unsign } from "./tokens";

/** Single-use WebAuthn challenges, stored server-side and referenced by a signed cookie. */
export type ChallengePurpose = "register" | "login" | "add-passkey";
const TTL_MS = 5 * 60_000;

export async function saveChallenge(req: Request, purpose: ChallengePurpose, challenge: string, data: Prisma.InputJsonValue): Promise<string> {
  const db = getDb()!;
  const id = newToken(18);
  await db.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.authChallenge.create({ data: { id, challenge, purpose, data, expiresAt: new Date(Date.now() + TTL_MS) } });
  return cookie(CHALLENGE_COOKIE, sign(id), { maxAge: TTL_MS / 1000, secure: relyingParty(req).secure });
}

export async function takeChallenge<T>(req: Request, purpose: ChallengePurpose): Promise<{ challenge: string; data: T }> {
  const id = unsign(readCookie(req.headers.get("cookie"), CHALLENGE_COOKIE));
  if (!id) throw new HttpError(400, "Your sign-in attempt expired — please try again");
  const db = getDb()!;
  // Delete-on-read makes every challenge single use.
  const row = await db.authChallenge.delete({ where: { id } }).catch(() => null);
  if (!row || row.purpose !== purpose || row.expiresAt.getTime() < Date.now()) throw new HttpError(400, "Your sign-in attempt expired — please try again");
  return { challenge: row.challenge, data: row.data as T };
}

export function clearChallengeCookie(req: Request): string {
  return cookie(CHALLENGE_COOKIE, "", { maxAge: 0, secure: relyingParty(req).secure });
}
