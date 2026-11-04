import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { RulesDataset } from "@/lib/domain/types";
import { BenefitFields, BonusFields, PartnerFields, type ExtractedProposal, type WatchSourceInfo } from "./extract";

/** Stable identity for a proposed change, so the same change is never proposed twice. */
export function proposalFingerprint(sourceId: string, p: ExtractedProposal): string {
  const body = p.benefit ?? p.transferPartner ?? p.transferBonus ?? {};
  return createHash("sha256").update(JSON.stringify([sourceId, p.action, p.ruleType, p.ruleId, body])).digest("hex");
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export class ApplyError extends Error {}

export interface StoredProposal {
  action: string;
  ruleType: string;
  ruleId: string | null;
  payload: unknown;
  source: (WatchSourceInfo & { url: string }) | null;
}

/**
 * Apply an approved proposal to the rules tables inside a transaction and
 * record it in the RuleVerification audit log. Requires a seeded database.
 */
export async function applyProposal(db: PrismaClient, p: StoredProposal, rules: RulesDataset, today: string, decidedBy: string): Promise<string> {
  const sourceUrl = p.source?.url;
  const verified = { verification: "verified" as const, lastVerified: day(today), ...(sourceUrl ? { sourceUrl } : {}) };
  const payload = p.payload as Record<string, unknown>;
  let ruleId = p.ruleId ?? "";
  // Unseeded databases fall back to the bundled rules, so writes would be silently ignored.
  if ((await db.rewardsProgram.count()) === 0) throw new ApplyError("The rules tables are empty — run `npm run db:seed` once so approved changes have somewhere to go.");

  await db.$transaction(async (tx) => {
    if (p.ruleType === "benefit") {
      const b = BenefitFields.parse(payload.benefit);
      const fields = { name: b.name, description: b.description, category: b.category, amountCents: b.amountCents, period: b.period, enrollmentRequired: b.enrollmentRequired, bookingChannel: b.bookingChannel, appliesTo: b.appliesTo, limitations: b.limitations };
      if (p.action === "add") {
        const cardId = p.source?.cardId;
        if (!cardId || !(await tx.card.findUnique({ where: { id: cardId } }))) throw new ApplyError("The card for this page isn't in the database — run `npm run db:seed` first.");
        ruleId = `${cardId}-${slug(b.name)}`;
        if (await tx.benefit.findUnique({ where: { id: ruleId } })) ruleId = `${ruleId}-${today.replace(/-/g, "")}`;
        await tx.benefit.create({ data: { id: ruleId, cardId, ...fields, eligibility: [], eligibleTags: [], effectiveFrom: day(today), notes: "Added from the benefits watcher", ...verified } });
      } else {
        const existing = await tx.benefit.findUnique({ where: { id: ruleId } });
        if (!existing) throw new ApplyError(`Benefit ${ruleId} isn't in the database — run \`npm run db:seed\` first.`);
        if (p.action === "retire") await tx.benefit.update({ where: { id: ruleId }, data: { effectiveTo: day(today), ...verified } });
        else await tx.benefit.update({ where: { id: ruleId }, data: { ...fields, ...verified } });
      }
    } else if (p.ruleType === "transferPartner") {
      const t = PartnerFields.parse(payload.transferPartner);
      const from = p.source?.programId ?? rules.cards.find((c) => c.id === p.source?.cardId)?.programId;
      if (!from) throw new ApplyError("Couldn't tell which points program this partner belongs to.");
      if (!(await tx.rewardsProgram.findUnique({ where: { id: t.toProgram } }))) throw new ApplyError(`Program "${t.toProgram}" isn't in PerkPilot's database yet.`);
      if (p.action === "add") {
        ruleId = `${from}->${t.toProgram}`;
        const data = { ratioFrom: t.ratioFrom, ratioTo: t.ratioTo, transferTime: t.transferTime, effectiveTo: null, ...verified };
        await tx.transferPartner.upsert({
          where: { id: ruleId },
          update: data,
          create: { id: ruleId, fromProgram: from, toProgram: t.toProgram, increment: 1000, minimumTransfer: 1000, recipient: from === "amex-mr" ? "cardmember_or_authorized_user" : "cardmember_only", effectiveFrom: day(today), ...data },
        });
      } else {
        if (!(await tx.transferPartner.findUnique({ where: { id: ruleId } }))) throw new ApplyError(`Transfer partner ${ruleId} isn't in the database — run \`npm run db:seed\` first.`);
        if (p.action === "retire") await tx.transferPartner.update({ where: { id: ruleId }, data: { effectiveTo: day(today), ...verified } });
        else await tx.transferPartner.update({ where: { id: ruleId }, data: { ratioFrom: t.ratioFrom, ratioTo: t.ratioTo, transferTime: t.transferTime, ...verified } });
      }
    } else if (p.ruleType === "transferBonus") {
      const t = BonusFields.parse(payload.transferBonus);
      const from = p.source?.programId ?? rules.cards.find((c) => c.id === p.source?.cardId)?.programId;
      if (!from) throw new ApplyError("Couldn't tell which points program this bonus belongs to.");
      if (t.endDate < t.startDate) throw new ApplyError("The bonus ends before it starts.");
      if (p.action === "retire") {
        await tx.transferBonus.update({ where: { id: ruleId }, data: { endDate: day(today), ...verified } });
      } else {
        ruleId = p.action === "update" && ruleId ? ruleId : `bonus-${from}-${t.toProgram}-${t.startDate}`;
        const data = { bonusPercent: t.bonusPercent, startDate: day(t.startDate), endDate: day(t.endDate), notes: "From the benefits watcher", ...verified };
        await tx.transferBonus.upsert({ where: { id: ruleId }, update: data, create: { id: ruleId, fromProgram: from, toProgram: t.toProgram, ...data } });
      }
    } else {
      throw new ApplyError(`Unknown rule type ${p.ruleType}`);
    }
    await tx.ruleVerification.create({
      data: { ruleType: p.ruleType, ruleId, status: "verified", verifiedBy: decidedBy, sourceUrl, notes: `Benefits watcher: ${p.action} approved` },
    });
  });
  return ruleId;
}
