import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { authEnabled } from "./config";
import { getSessionUser } from "./session";

/** Bearer PERKPILOT_ADMIN_TOKEN (32+ chars). */
export function hasAdminToken(req: Request): boolean {
  const expected = process.env.PERKPILOT_ADMIN_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Admin token, or the signed-in owner when logins are enabled. Returns who acted, or null. */
export async function adminActor(req: Request): Promise<string | null> {
  if (hasAdminToken(req)) return "admin-token";
  if (!authEnabled() || !getDb()) return null;
  const user = await getSessionUser(req).catch(() => null);
  return user?.role === "owner" ? user.name || user.id : null;
}
