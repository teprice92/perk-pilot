import "server-only";
import { getDb } from "@/lib/server/db";
import type { SessionUser } from "./session";

export type AiDenyReason = "not_enabled" | "user_limit";

export function userDailyLimit(): number {
  return Math.max(0, Number(process.env.CONCIERGE_USER_DAILY_LIMIT ?? 30));
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Whether this user's concierge request may call the paid LLM. Without
 * logins (local mode) only the instance-wide ceiling applies.
 */
export async function aiAccess(user: SessionUser | null): Promise<{ allowed: boolean; reason?: AiDenyReason; usedToday?: number; limit?: number }> {
  if (!user) return { allowed: true };
  if (!user.aiEnabled) return { allowed: false, reason: "not_enabled" };
  const limit = userDailyLimit();
  const row = await getDb()!.aiUsage.findUnique({ where: { userId_day: { userId: user.id, day: today() } } });
  const used = row?.count ?? 0;
  return used < limit ? { allowed: true, usedToday: used, limit } : { allowed: false, reason: "user_limit", usedToday: used, limit };
}

export async function recordAiUse(user: SessionUser | null): Promise<void> {
  if (!user) return;
  await getDb()!.aiUsage.upsert({
    where: { userId_day: { userId: user.id, day: today() } },
    create: { userId: user.id, day: today(), count: 1 },
    update: { count: { increment: 1 } },
  });
}
