import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { BenefitOverrideSchema, BenefitUsageSchema, HouseholdSchema } from "@/lib/domain/schemas";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * Household sync for self-hosted deployments.
 * Both travelers' devices share one secret (PERKPILOT_SYNC_TOKEN). This is a
 * pragmatic single-household mechanism; multi-user deployments should replace
 * it with real authentication (see docs/ARCHITECTURE.md → Authentication).
 */
const SYNC_ID = "sync-household";
const MAX_BYTES = 8 * 1024 * 1024;

const SnapshotSchema = z.object({
  household: HouseholdSchema,
  usage: z.array(BenefitUsageSchema).max(2000),
  overrides: z.array(BenefitOverrideSchema).max(500),
  trips: z.array(z.record(z.string(), z.unknown())).max(50),
  savedAt: z.string().max(40),
});

function authorized(req: Request): boolean {
  const expected = process.env.PERKPILOT_SYNC_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "sync"), 60);
  if (!rl.ok) return tooMany(rl.resetAt);
  const db = getDb();
  if (!db || !process.env.PERKPILOT_SYNC_TOKEN) return Response.json({ error: "Sync is not configured on this server" }, { status: 501 });
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const row = await db.household.findUnique({ where: { id: SYNC_ID } });
  return Response.json({ snapshot: row?.syncSnapshot ?? null, updatedAt: row?.updatedAt ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const rl = rateLimit(clientKey(req, "sync"), 60);
  if (!rl.ok) return tooMany(rl.resetAt);
  const db = getDb();
  if (!db || !process.env.PERKPILOT_SYNC_TOKEN) return Response.json({ error: "Sync is not configured on this server" }, { status: 501 });
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return Response.json({ error: "Snapshot too large" }, { status: 413 });
  const parsed = SnapshotSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid snapshot", issues: parsed.error.issues.slice(0, 5) }, { status: 422 });
  const s = parsed.data;
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
  await db.household.upsert({ where: { id: SYNC_ID }, create: { id: SYNC_ID, ...base }, update: base });
  return Response.json({ ok: true, savedAt: s.savedAt });
}
