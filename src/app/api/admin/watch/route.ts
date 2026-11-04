import { z } from "zod";
import { adminActor } from "@/lib/server/auth/admin";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";
import { loadRules } from "@/lib/server/rules-db";
import { invalidate } from "@/lib/server/cache";
import { ApplyError, applyProposal } from "@/lib/watcher/apply";
import { aiConfigured, checkSource, ensureSources, runWatcher } from "@/lib/watcher/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Benefits watcher (owner only).
 *  GET  → watched pages and proposals
 *  POST → { action: "check", sourceId? } | { action: "paste", sourceId, text }
 *         | { action: "decide", proposalId, decision } | { action: "source", ... }
 */

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), sourceId: z.string().max(40).optional(), force: z.boolean().optional() }),
  z.object({ action: z.literal("paste"), sourceId: z.string().max(40), text: z.string().min(200).max(200_000) }),
  z.object({ action: z.literal("decide"), proposalId: z.string().max(40), decision: z.enum(["approve", "reject"]) }),
  z.object({
    action: z.literal("source"),
    sourceId: z.string().max(40).optional(),
    label: z.string().min(2).max(120).optional(),
    url: z.string().url().max(500).refine((u) => u.startsWith("https://"), "Use an https:// address").optional(),
    kind: z.enum(["card_benefits", "transfer_partners"]).optional(),
    cardId: z.string().max(60).nullable().optional(),
    programId: z.string().max(60).nullable().optional(),
    enabled: z.boolean().optional(),
    aiFetch: z.boolean().optional(),
    remove: z.boolean().optional(),
  }),
]);

function requireDb() {
  const db = getDb();
  if (!db) throw new HttpError(501, "The benefits watcher needs DATABASE_URL.");
  return db;
}

async function snapshot() {
  const db = requireDb();
  await ensureSources(db);
  const [sources, proposals] = await Promise.all([
    db.watchedSource.findMany({ orderBy: { createdAt: "asc" } }),
    db.ruleProposal.findMany({ where: { OR: [{ status: "pending" }, { decidedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }] }, orderBy: { createdAt: "desc" }, take: 100, include: { source: { select: { label: true, url: true } } } }),
  ]);
  return { aiConfigured: aiConfigured(), schedule: "Mondays, 13:00 UTC", sources, proposals };
}

export async function GET(req: Request) {
  try {
    const rl = rateLimit(clientKey(req, "admin"), 60);
    if (!rl.ok) return tooMany(rl.resetAt);
    if (!(await adminActor(req))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(await snapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const rl = rateLimit(clientKey(req, "admin"), 30);
    if (!rl.ok) return tooMany(rl.resetAt);
    const actor = await adminActor(req);
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    assertSameOrigin(req);
    const parsed = Body.safeParse(await readJson(req, 256 * 1024));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 422 });
    const body = parsed.data;
    const db = requireDb();
    const today = new Date().toISOString().slice(0, 10);

    if (body.action === "check") {
      if (body.sourceId) {
        const source = await db.watchedSource.findUnique({ where: { id: body.sourceId } });
        if (!source) throw new HttpError(404, "Unknown page");
        await checkSource(db, source, { force: body.force });
      } else {
        await runWatcher(db, { force: body.force });
      }
    } else if (body.action === "paste") {
      const source = await db.watchedSource.findUnique({ where: { id: body.sourceId } });
      if (!source) throw new HttpError(404, "Unknown page");
      if (!aiConfigured()) throw new HttpError(503, "Reviewing pasted text needs ANTHROPIC_API_KEY.");
      await checkSource(db, source, { pastedText: body.text });
    } else if (body.action === "decide") {
      const p = await db.ruleProposal.findUnique({ where: { id: body.proposalId }, include: { source: true } });
      if (!p) throw new HttpError(404, "Unknown proposal");
      if (p.status !== "pending" && p.status !== "failed") throw new HttpError(409, "This change was already decided.");
      if (body.decision === "reject") {
        await db.ruleProposal.update({ where: { id: p.id }, data: { status: "rejected", decidedAt: new Date(), decidedBy: actor } });
      } else {
        try {
          const rules = await loadRules();
          const source = p.source ? { label: p.source.label, url: p.source.url, kind: p.source.kind as "card_benefits" | "transfer_partners", cardId: p.source.cardId, programId: p.source.programId } : null;
          const ruleId = await applyProposal(db, { action: p.action, ruleType: p.ruleType, ruleId: p.ruleId, payload: p.payload, source }, rules, today, actor);
          await db.ruleProposal.update({ where: { id: p.id }, data: { status: "approved", ruleId, error: null, decidedAt: new Date(), decidedBy: actor } });
          invalidate("rules");
        } catch (e) {
          const msg = e instanceof ApplyError ? e.message : e instanceof z.ZodError ? "The proposed values are incomplete." : "Couldn't apply this change.";
          if (!(e instanceof ApplyError) && !(e instanceof z.ZodError)) console.error("[perkpilot] apply proposal failed", e);
          await db.ruleProposal.update({ where: { id: p.id }, data: { status: "failed", error: msg } });
          throw new HttpError(400, msg);
        }
      }
    } else if (body.action === "source") {
      const { sourceId, remove, action: _a, ...fields } = body;
      if (sourceId && remove) await db.watchedSource.delete({ where: { id: sourceId } });
      else if (sourceId) await db.watchedSource.update({ where: { id: sourceId }, data: { ...fields, ...(fields.url ? { contentHash: null } : {}) } });
      else {
        if (!fields.label || !fields.url || !fields.kind) throw new HttpError(422, "A new page needs a name, an https address and a kind.");
        if (fields.kind === "card_benefits" && !fields.cardId) throw new HttpError(422, "Choose which card this page describes.");
        if (fields.kind === "transfer_partners" && !fields.programId) throw new HttpError(422, "Choose which points program this page describes.");
        await db.watchedSource.create({ data: { label: fields.label, url: fields.url, kind: fields.kind, cardId: fields.cardId ?? null, programId: fields.programId ?? null } });
      }
    }
    return Response.json(await snapshot());
  } catch (e) {
    return errorResponse(e);
  }
}
