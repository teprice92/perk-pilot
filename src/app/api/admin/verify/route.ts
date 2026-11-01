import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { STALE_AFTER_DAYS, verificationFreshness } from "@/lib/rules/freshness";
import { invalidate } from "@/lib/server/cache";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { loadRules } from "@/lib/server/rules-db";

export const runtime = "nodejs";

/**
 * Admin rule-verification workflow (Phase 3 "verified benefits data").
 * An administrator checks a rule against its official source and records the
 * result here. Every action is written to the RuleVerification audit log and
 * the rule's verification status / lastVerified date are updated.
 *
 *  GET  /api/admin/verify          → rules that are unverified or stale
 *  POST /api/admin/verify          → record a verification
 *
 * Requires DATABASE_URL and PERKPILOT_ADMIN_TOKEN (Bearer).
 */

const Body = z.object({
  ruleType: z.enum(["benefit", "transferPartner", "transferBonus", "portalRate", "program", "card"]),
  ruleId: z.string().min(1).max(120),
  status: z.enum(["verified", "unverified", "estimated", "demo"]),
  sourceUrl: z.string().url().max(500).optional(),
  notes: z.string().max(1000).optional(),
  verifiedBy: z.string().max(120).optional(),
  /** Benefit only: corrected amount (previous value kept in the audit log). */
  amountCents: z.number().int().min(0).max(10_000_000).optional(),
});

function authorized(req: Request): boolean {
  const expected = process.env.PERKPILOT_ADMIN_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rules = await loadRules();
  const today = new Date().toISOString().slice(0, 10);
  const pick = (type: string, list: Array<{ id: string; verification: string; lastVerified?: string | null; sourceUrl?: string }>) =>
    list
      .map((r) => ({ ruleType: type, ruleId: r.id, verification: r.verification, lastVerified: r.lastVerified ?? null, sourceUrl: r.sourceUrl, freshness: verificationFreshness(r.verification as never, r.lastVerified, today) }))
      .filter((r) => r.freshness !== "fresh");
  return Response.json({
    staleAfterDays: STALE_AFTER_DAYS,
    queue: [
      ...pick("benefit", rules.benefits),
      ...pick("transferPartner", rules.transferPartners),
      ...pick("transferBonus", rules.transferBonuses),
      ...pick("portalRate", rules.portalRates),
    ],
  });
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "admin"), 60);
  if (!rl.ok) return tooMany(rl.resetAt);
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "DATABASE_URL is required for verification" }, { status: 501 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5) }, { status: 422 });
  const v = parsed.data;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const data = { verification: v.status, lastVerified: v.status === "verified" ? today : null, ...(v.sourceUrl ? { sourceUrl: v.sourceUrl } : {}) };
  try {
    await db.$transaction(async (tx) => {
      switch (v.ruleType) {
        case "benefit": {
          // Amount corrections update the row in place (usage records reference the
          // benefit id); the previous amount is preserved in the audit log notes.
          const old = await tx.benefit.findUniqueOrThrow({ where: { id: v.ruleId } });
          if (v.amountCents !== undefined && v.amountCents !== old.amountCents) {
            v.notes = `${v.notes ? `${v.notes} · ` : ""}amount ${old.amountCents ?? "none"} → ${v.amountCents} cents`;
          }
          await tx.benefit.update({ where: { id: v.ruleId }, data: { ...data, ...(v.amountCents !== undefined ? { amountCents: v.amountCents } : {}) } });
          break;
        }
        case "transferPartner":
          await tx.transferPartner.update({ where: { id: v.ruleId }, data });
          break;
        case "transferBonus":
          await tx.transferBonus.update({ where: { id: v.ruleId }, data });
          break;
        case "portalRate":
          await tx.portalRate.update({ where: { id: v.ruleId }, data });
          break;
        case "program":
          await tx.rewardsProgram.update({ where: { id: v.ruleId }, data });
          break;
        case "card":
          await tx.card.update({ where: { id: v.ruleId }, data });
          break;
      }
      await tx.ruleVerification.create({ data: { ruleType: v.ruleType, ruleId: v.ruleId, status: v.status, verifiedBy: v.verifiedBy, sourceUrl: v.sourceUrl, notes: v.notes } });
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 400 });
  }
  invalidate("rules");
  return Response.json({ ok: true });
}
