import "server-only";
import { getDb } from "@/lib/server/db";
import { relyingParty } from "./config";
import { cookie, newToken, readCookie, SESSION_COOKIE, SESSION_DAYS, sha256, sign, unsign } from "./tokens";

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  role: "owner" | "member";
  aiEnabled: boolean;
  householdId: string | null;
  sessionId: string;
}

const DAY = 86_400_000;

function db() {
  const d = getDb();
  if (!d) throw new Error("Database not configured");
  return d;
}

/** Create a session and return the Set-Cookie header value. */
export async function createSession(userId: string, req: Request): Promise<string> {
  const token = newToken();
  await db().session.create({
    data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * DAY), userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null },
  });
  await db().user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return cookie(SESSION_COOKIE, sign(token), { maxAge: SESSION_DAYS * 86_400, secure: relyingParty(req).secure });
}

export function clearSessionCookie(req: Request): string {
  return cookie(SESSION_COOKIE, "", { maxAge: 0, secure: relyingParty(req).secure });
}

function sessionIdFrom(req: Request): string | null {
  const token = unsign(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return token ? sha256(token) : null;
}

/** Resolve the signed-in user, or null. Sliding expiry: refreshed at most daily. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const id = sessionIdFrom(req);
  if (!id) return null;
  const s = await db().session.findUnique({ where: { id }, include: { user: true } });
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now() || s.user.disabled) {
    await db().session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (Date.now() - s.lastSeenAt.getTime() > DAY) {
    await db().session.update({ where: { id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) } }).catch(() => {});
  }
  const u = s.user;
  return { id: u.id, name: u.name, email: u.email, role: u.role === "owner" ? "owner" : "member", aiEnabled: u.aiEnabled, householdId: u.householdId, sessionId: id };
}

export async function destroySession(req: Request, everywhere = false): Promise<void> {
  const id = sessionIdFrom(req);
  if (!id) return;
  if (everywhere) {
    const s = await db().session.findUnique({ where: { id } });
    if (s) await db().session.deleteMany({ where: { userId: s.userId } });
  } else {
    await db().session.delete({ where: { id } }).catch(() => {});
  }
}
