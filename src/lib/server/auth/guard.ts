import "server-only";
import { HttpError } from "@/lib/server/request";
import { assertAuthConfigured, authEnabled } from "./config";
import { getSessionUser, type SessionUser } from "./session";

/**
 * - Logins disabled: returns null and the request proceeds (local/demo mode).
 * - Logins enabled: returns the signed-in user or throws 401.
 */
export async function requireUser(req: Request): Promise<SessionUser | null> {
  if (!authEnabled()) return null;
  assertAuthConfigured();
  const user = await getSessionUser(req);
  if (!user) throw new HttpError(401, "Please sign in");
  return user;
}

export async function requireOwner(req: Request): Promise<SessionUser> {
  if (!authEnabled()) throw new HttpError(404, "Not found");
  const user = await requireUser(req);
  if (user?.role !== "owner") throw new HttpError(403, "Only the account owner can do that");
  return user;
}
