import "server-only";
import type { Benefit, Card, PortalRate, RewardsProgram, RulesDataset, TransferBonus, TransferPartner } from "@/lib/domain/types";
import { SEED_RULES } from "@/lib/rules/seed";
import { cached } from "./cache";
import { getDb } from "./db";

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : null);

/**
 * Load the rules dataset from Postgres when configured (and seeded), otherwise
 * return the bundled starter dataset. Cached for 5 minutes per instance.
 */
export async function loadRules(): Promise<RulesDataset> {
  const db = getDb();
  if (!db) return SEED_RULES;
  return cached("rules", 5 * 60_000, async () => {
    try {
      const [programs, cards, benefits, partners, bonuses, portal] = await Promise.all([
        db.rewardsProgram.findMany(),
        db.card.findMany({ include: { annualFees: true, earnRules: true } }),
        db.benefit.findMany(),
        db.transferPartner.findMany(),
        db.transferBonus.findMany(),
        db.portalRate.findMany(),
      ]);
      if (!programs.length) return SEED_RULES;
      const prov = (r: { verification: string; sourceUrl: string | null; lastVerified: Date | null }) => ({
        verification: r.verification as RewardsProgram["verification"],
        sourceUrl: r.sourceUrl ?? undefined,
        lastVerified: d(r.lastVerified),
      });
      return {
        version: `db-${new Date().toISOString().slice(0, 10)}`,
        asOf: new Date().toISOString().slice(0, 10),
        disclaimer: SEED_RULES.disclaimer,
        programs: programs.map((p): RewardsProgram => ({
          id: p.id, name: p.name, shortName: p.shortName, kind: p.kind, currency: p.currency as RewardsProgram["currency"],
          alliance: (p.alliance as RewardsProgram["alliance"]) ?? null, bookableCarriers: p.bookableCarriers, hotelChain: p.hotelChain ?? undefined,
          canBookForOthers: p.canBookForOthers, awardSearchUrl: p.awardSearchUrl ?? undefined, pooling: p.pooling as unknown as RewardsProgram["pooling"],
          ...prov(p), notes: p.notes ?? undefined,
        })),
        cards: cards.map((c): Card => {
          const fee = c.annualFees.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
          return {
            id: c.id, name: c.name, issuer: c.issuer, programId: c.programId, network: c.network, art: c.art as unknown as Card["art"], ...prov(c),
            annualFee: fee ? { amountCents: fee.amountCents, effectiveFrom: d(fee.effectiveFrom)!, effectiveTo: d(fee.effectiveTo), ...prov(fee) } : undefined,
            earnRules: c.earnRules.map((e) => ({ category: e.category as Card["earnRules"][number]["category"], multiplier: Number(e.multiplier), annualCapCents: e.annualCapCents ?? undefined, description: e.description, effectiveFrom: d(e.effectiveFrom)!, effectiveTo: d(e.effectiveTo), ...prov(e) })),
          };
        }),
        benefits: benefits.map((b): Benefit => ({
          id: b.id, cardId: b.cardId, name: b.name, description: b.description, category: b.category as Benefit["category"], amountCents: b.amountCents ?? undefined,
          period: b.period as Benefit["period"], eligibility: b.eligibility, enrollmentRequired: b.enrollmentRequired, bookingChannel: (b.bookingChannel as Benefit["bookingChannel"]) ?? undefined,
          appliesTo: b.appliesTo as Benefit["appliesTo"], eligibleTags: b.eligibleTags, minNights: b.minNights ?? undefined, prepaidRequired: b.prepaidRequired,
          limitations: b.limitations, renewal: b.renewal ?? undefined, appliesToAuthorizedUsers: b.appliesToAuthorizedUsers, perks: (b.perks as unknown as Benefit["perks"]) ?? undefined,
          effectiveFrom: d(b.effectiveFrom)!, effectiveTo: d(b.effectiveTo), ...prov(b), notes: b.notes ?? undefined,
        })),
        transferPartners: partners.map((t): TransferPartner => ({
          id: t.id, fromProgram: t.fromProgram, toProgram: t.toProgram, ratioFrom: t.ratioFrom, ratioTo: t.ratioTo, increment: t.increment, minimumTransfer: t.minimumTransfer,
          transferTime: t.transferTime, recipient: t.recipient as TransferPartner["recipient"], effectiveFrom: d(t.effectiveFrom)!, effectiveTo: d(t.effectiveTo), ...prov(t),
        })),
        transferBonuses: bonuses.map((t): TransferBonus => ({
          id: t.id, fromProgram: t.fromProgram, toProgram: t.toProgram, bonusPercent: t.bonusPercent, startDate: d(t.startDate)!, endDate: d(t.endDate)!, ...prov(t), notes: t.notes ?? undefined,
        })),
        portalRates: portal.map((r): PortalRate => ({
          id: r.id, programId: r.programId, cardId: r.cardId, channel: r.channel as PortalRate["channel"], appliesTo: r.appliesTo as PortalRate["appliesTo"],
          centsPerPoint: Number(r.centsPerPoint), condition: r.cardOpenedBefore ? { cardOpenedBefore: d(r.cardOpenedBefore)! } : undefined, description: r.description,
          effectiveFrom: d(r.effectiveFrom)!, effectiveTo: d(r.effectiveTo), ...prov(r),
        })),
      };
    } catch (e) {
      console.error("[perkpilot] Failed to load rules from database; using seed.", e);
      return SEED_RULES;
    }
  });
}
