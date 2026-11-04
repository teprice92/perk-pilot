import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { AMEX_MR_TRANSFER_URL, AMEX_PLAT_URL, CHASE_UR_URL, CSR_URL } from "@/lib/rules/seed";
import { invalidate } from "@/lib/server/cache";
import { loadRules } from "@/lib/server/rules-db";
import { proposalFingerprint } from "./apply";
import { ExtractionError, extractChanges, type WatchSourceInfo } from "./extract";
import { fetchPageText, normalizeForHash } from "./page";

export const DEFAULT_SOURCES: Array<WatchSourceInfo & { label: string }> = [
  { label: "Amex Platinum — card benefits", url: AMEX_PLAT_URL, kind: "card_benefits", cardId: "amex-platinum" },
  { label: "Chase Sapphire Reserve — card benefits", url: CSR_URL, kind: "card_benefits", cardId: "chase-sapphire-reserve" },
  { label: "Amex Membership Rewards — transfer partners", url: AMEX_MR_TRANSFER_URL, kind: "transfer_partners", programId: "amex-mr" },
  { label: "Chase Ultimate Rewards — transfer partners", url: CHASE_UR_URL, kind: "transfer_partners", programId: "chase-ur" },
];

/** Create the default watched pages the first time the watcher is used. */
export async function ensureSources(db: PrismaClient) {
  if ((await db.watchedSource.count()) > 0) return;
  await db.watchedSource.createMany({ data: DEFAULT_SOURCES.map((s) => ({ label: s.label, url: s.url, kind: s.kind, cardId: s.cardId ?? null, programId: s.programId ?? null })) });
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface CheckResult {
  sourceId: string;
  status: "unchanged" | "changed" | "blocked" | "error" | "reviewed";
  message: string;
  newProposals: number;
}

type Source = Awaited<ReturnType<PrismaClient["watchedSource"]["findUniqueOrThrow"]>>;

/**
 * Check one page. Direct fetch first: if the text hasn't changed since the
 * last check, stop there (no AI cost). If it changed — or `force` is set, or
 * the owner pasted the text — Claude compares it with the current rules.
 * Pages that can't be read directly are reviewed through Claude's web fetch
 * when the source allows it.
 */
export async function checkSource(db: PrismaClient, source: Source, opts: { force?: boolean; pastedText?: string; today?: string } = {}): Promise<CheckResult> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const info: WatchSourceInfo = { label: source.label, url: source.url, kind: source.kind as WatchSourceInfo["kind"], cardId: source.cardId, programId: source.programId };
  const finish = async (status: CheckResult["status"], message: string, extra: Record<string, unknown> = {}, newProposals = 0): Promise<CheckResult> => {
    await db.watchedSource.update({ where: { id: source.id }, data: { lastCheckedAt: new Date(), lastStatus: status, lastMessage: message.slice(0, 500), ...extra } });
    return { sourceId: source.id, status, message, newProposals };
  };

  let text: string | undefined = opts.pastedText?.trim() || undefined;
  let hash: string | undefined;
  let blockedReason: string | undefined;
  if (!text) {
    const page = await fetchPageText(source.url);
    if (page.ok) text = page.text;
    else blockedReason = page.reason;
  }
  if (text) {
    hash = createHash("sha256").update(normalizeForHash(text)).digest("hex");
    if (!opts.force && !opts.pastedText && hash === source.contentHash) return finish("unchanged", "No changes since the last check.");
  }
  if (!text && !source.aiFetch) return finish("blocked", `${blockedReason}. Paste the page text to review it, or allow AI fetch for this page.`);
  if (!aiConfigured()) {
    return finish(text ? "changed" : "blocked", text ? "The page changed, but ANTHROPIC_API_KEY isn't set so it can't be reviewed." : `${blockedReason}.`, hash ? { contentHash: hash, contentChars: text!.length, lastChangedAt: new Date() } : {});
  }

  const rules = await loadRules();
  let extraction;
  try {
    extraction = await extractChanges(info, rules, today, text);
  } catch (e) {
    const msg = e instanceof ExtractionError ? e.message : "The AI review failed — try again later.";
    if (!(e instanceof ExtractionError)) console.error("[perkpilot] watcher extraction failed", e);
    return finish("error", msg);
  }
  if (!extraction.pageReadable) {
    return finish("blocked", `${blockedReason ? `${blockedReason}; ` : ""}Claude couldn't read the benefits on this page. Paste the page text instead.`);
  }

  let created = 0;
  for (const p of extraction.proposals) {
    // Drop malformed entries rather than surfacing them for approval.
    const body = p.ruleType === "benefit" ? p.benefit : p.ruleType === "transferPartner" ? p.transferPartner : p.transferBonus;
    if (!body || (p.action !== "add" && !p.ruleId)) continue;
    const fingerprint = proposalFingerprint(source.id, p);
    const exists = await db.ruleProposal.findUnique({ where: { fingerprint } });
    if (exists) continue;
    await db.ruleProposal.create({
      data: { sourceId: source.id, action: p.action, ruleType: p.ruleType, ruleId: p.ruleId, title: p.title, explanation: p.explanation, evidence: p.evidence, confidence: p.confidence, payload: { benefit: p.benefit, transferPartner: p.transferPartner, transferBonus: p.transferBonus }, fingerprint },
    });
    created++;
  }
  const message = created ? `${extraction.summary} ${created} change${created === 1 ? "" : "s"} to review.` : extraction.proposals.length ? `${extraction.summary} (Already reviewed.)` : extraction.summary || "Nothing material changed.";
  return finish(created ? "changed" : "reviewed", message, hash ? { contentHash: hash, contentChars: text!.length, lastChangedAt: new Date() } : {}, created);
}

/** Check every enabled page (used by the scheduled job and "Check all"). */
export async function runWatcher(db: PrismaClient, opts: { force?: boolean } = {}): Promise<CheckResult[]> {
  await ensureSources(db);
  const sources = await db.watchedSource.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  const results: CheckResult[] = [];
  for (const s of sources) {
    try {
      results.push(await checkSource(db, s, opts));
    } catch (e) {
      console.error("[perkpilot] watcher check failed", s.url, e);
      results.push({ sourceId: s.id, status: "error", message: "Check failed unexpectedly.", newProposals: 0 });
    }
  }
  invalidate("rules");
  return results;
}
