import { z } from "zod";
import { requireOwner } from "@/lib/server/auth/guard";
import { userDailyLimit } from "@/lib/server/auth/ai";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

/** Owner only: list users with their AI access and usage. */
export async function GET(req: Request) {
  try {
    await requireOwner(req);
    const db = getDb()!;
    const day = new Date().toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { passkeys: true, sessions: true } }, aiUsage: { where: { day: { startsWith: month } } } },
    });
    return Response.json(
      {
        dailyLimit: userDailyLimit(),
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          aiEnabled: u.aiEnabled,
          disabled: u.disabled,
          householdId: u.householdId,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          passkeys: u._count.passkeys,
          activeSessions: u._count.sessions,
          aiToday: u.aiUsage.find((x) => x.day === day)?.count ?? 0,
          aiThisMonth: u.aiUsage.reduce((a, x) => a + x.count, 0),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

const Patch = z.object({ id: z.string().max(80), aiEnabled: z.boolean().optional(), disabled: z.boolean().optional() });

/** Owner only: turn AI on/off for a user, or disable/enable their account. */
export async function PATCH(req: Request) {
  try {
    assertSameOrigin(req);
    const owner = await requireOwner(req);
    const rl = rateLimit(clientKey(req, "admin"), 60);
    if (!rl.ok) return tooMany(rl.resetAt);
    const parsed = Patch.safeParse(await readJson(req, 2048));
    if (!parsed.success) throw new HttpError(422, "Invalid request");
    const { id, aiEnabled, disabled } = parsed.data;
    if (id === owner.id && disabled) throw new HttpError(409, "You can't disable your own account");
    const db = getDb()!;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, "User not found");
    await db.user.update({ where: { id }, data: { ...(aiEnabled !== undefined ? { aiEnabled } : {}), ...(disabled !== undefined ? { disabled } : {}) } });
    if (disabled) await db.session.deleteMany({ where: { userId: id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Owner only: delete a user and their passkeys and sessions. */
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const owner = await requireOwner(req);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (id === owner.id) throw new HttpError(409, "You can't delete your own account");
    const db = getDb()!;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, "User not found");
    await db.$transaction([db.household.updateMany({ where: { ownerId: id }, data: { ownerId: null } }), db.user.delete({ where: { id } })]);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
