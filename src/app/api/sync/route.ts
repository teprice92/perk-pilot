import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DataImportSchema } from "@/lib/domain/schemas";
import { authEnabled } from "@/lib/server/auth/config";
import { requireUser } from "@/lib/server/auth/guard";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

/**
 * Household sync.
 *  - Logins on (PERKPILOT_AUTH=passkey): each signed-in user syncs the
 *    household they belong to. Spouses invited with "join my household" share it.
 *  - Logins off: legacy single-household mode protected by PERKPILOT_SYNC_TOKEN.
 * Writes use optimistic concurrency: the client sends the version it last saw
 * and gets 409 (with the newer snapshot) if someone else saved in between.
 */
const LEGACY_ID = "sync-household";
const MAX_BYTES = 8 * 1024 * 1024;

const SnapshotSchema = DataImportSchema.extend({ savedAt: z.string().max(40), baseVersion: z.string().max(40).nullable().optional() });

function tokenAuthorized(req: Request): boolean {
  const expected = process.env.PERKPILOT_SYNC_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function targetHousehold(req: Request): Promise<string> {
  if (!getDb()) throw new HttpError(501, "Sync is not configured on this server");
  if (authEnabled()) {
    const user = await requireUser(req);
    if (!user?.householdId) throw new HttpError(409, "Your account isn't linked to a household");
    return user.householdId;
  }
  if (!process.env.PERKPILOT_SYNC_TOKEN) throw new HttpError(501, "Sync is not configured on this server");
  if (!tokenAuthorized(req)) throw new HttpError(401, "Unauthorized");
  return LEGACY_ID;
}

export async function GET(req: Request) {
  try {
    const rl = rateLimit(clientKey(req, "sync"), 120);
    if (!rl.ok) return tooMany(rl.resetAt);
    const id = await targetHousehold(req);
    const row = await getDb()!.household.findUnique({ where: { id } });
    return Response.json({ snapshot: row?.syncSnapshot ?? null, version: row?.syncSnapshot ? row.updatedAt.toISOString() : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    assertSameOrigin(req);
    const rl = rateLimit(clientKey(req, "sync"), 120);
    if (!rl.ok) return tooMany(rl.resetAt);
    const id = await targetHousehold(req);
    const parsed = SnapshotSchema.safeParse(await readJson(req, MAX_BYTES));
    if (!parsed.success) return Response.json({ error: "Invalid snapshot", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
    const { baseVersion, ...s } = parsed.data;
    const db = getDb()!;
    const current = await db.household.findUnique({ where: { id } });
    if (current?.syncSnapshot && baseVersion !== undefined && baseVersion !== current.updatedAt.toISOString()) {
      return Response.json({ error: "conflict", snapshot: current.syncSnapshot, version: current.updatedAt.toISOString() }, { status: 409 });
    }
    const base = {
      name: s.household.name,
      mode: s.household.mode,
      homeAirport: s.household.homeAirport,
      preferences: s.household.preferences,
      valuations: s.household.valuations,
      minRedemptionCpp: s.household.minRedemptionCpp,
      cashBudgetCents: s.household.cashBudgetCents,
      syncSnapshot: s as object,
    };
    const saved = await db.household.upsert({ where: { id }, create: { id, ...base }, update: base });
    return Response.json({ ok: true, version: saved.updatedAt.toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}
