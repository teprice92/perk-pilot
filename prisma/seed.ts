/**
 * Seeds the rules database from the bundled starter dataset.
 * Run: npm run db:seed   (requires DATABASE_URL)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { SEED_RULES } from "../src/lib/rules/seed";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const date = (s?: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

async function main() {
  const r = SEED_RULES;
  for (const p of r.programs) {
    const data = {
      name: p.name, shortName: p.shortName, kind: p.kind, currency: p.currency, alliance: p.alliance ?? null,
      bookableCarriers: p.bookableCarriers ?? [], hotelChain: p.hotelChain ?? null, canBookForOthers: p.canBookForOthers,
      awardSearchUrl: p.awardSearchUrl ?? null, pooling: p.pooling as object, verification: p.verification,
      sourceUrl: p.sourceUrl ?? null, lastVerified: date(p.lastVerified), notes: p.notes ?? null,
    };
    await prisma.rewardsProgram.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  for (const c of r.cards) {
    const data = { name: c.name, issuer: c.issuer, programId: c.programId, network: c.network, art: c.art, verification: c.verification, sourceUrl: c.sourceUrl ?? null, lastVerified: date(c.lastVerified) };
    await prisma.card.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
    await prisma.annualFee.deleteMany({ where: { cardId: c.id } });
    if (c.annualFee) {
      await prisma.annualFee.create({ data: { cardId: c.id, amountCents: c.annualFee.amountCents, effectiveFrom: date(c.annualFee.effectiveFrom)!, effectiveTo: date(c.annualFee.effectiveTo), verification: c.annualFee.verification, sourceUrl: c.annualFee.sourceUrl ?? null } });
    }
    await prisma.earnRule.deleteMany({ where: { cardId: c.id } });
    for (const e of c.earnRules) {
      await prisma.earnRule.create({ data: { cardId: c.id, category: e.category, multiplier: e.multiplier, annualCapCents: e.annualCapCents ?? null, description: e.description, effectiveFrom: date(e.effectiveFrom)!, effectiveTo: date(e.effectiveTo), verification: e.verification, sourceUrl: e.sourceUrl ?? null } });
    }
  }
  for (const b of r.benefits) {
    const data = {
      cardId: b.cardId, name: b.name, description: b.description, category: b.category, amountCents: b.amountCents ?? null, period: b.period,
      eligibility: b.eligibility, enrollmentRequired: b.enrollmentRequired, bookingChannel: b.bookingChannel ?? null, appliesTo: b.appliesTo,
      eligibleTags: b.eligibleTags ?? [], minNights: b.minNights ?? null, prepaidRequired: b.prepaidRequired ?? false, limitations: b.limitations,
      renewal: b.renewal ?? null, appliesToAuthorizedUsers: b.appliesToAuthorizedUsers ?? false, perks: (b.perks as object) ?? undefined,
      effectiveFrom: date(b.effectiveFrom)!, effectiveTo: date(b.effectiveTo), verification: b.verification, sourceUrl: b.sourceUrl ?? null,
      lastVerified: date(b.lastVerified), notes: b.notes ?? null,
    };
    await prisma.benefit.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
  }
  for (const t of r.transferPartners) {
    const data = { fromProgram: t.fromProgram, toProgram: t.toProgram, ratioFrom: t.ratioFrom, ratioTo: t.ratioTo, increment: t.increment, minimumTransfer: t.minimumTransfer, transferTime: t.transferTime, recipient: t.recipient, effectiveFrom: date(t.effectiveFrom)!, effectiveTo: date(t.effectiveTo), verification: t.verification, sourceUrl: t.sourceUrl ?? null, lastVerified: date(t.lastVerified) };
    await prisma.transferPartner.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
  }
  for (const t of r.transferBonuses) {
    const data = { fromProgram: t.fromProgram, toProgram: t.toProgram, bonusPercent: t.bonusPercent, startDate: date(t.startDate)!, endDate: date(t.endDate)!, verification: t.verification, sourceUrl: t.sourceUrl ?? null, notes: t.notes ?? null };
    await prisma.transferBonus.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
  }
  for (const p of r.portalRates) {
    const data = { programId: p.programId, cardId: p.cardId, channel: p.channel, appliesTo: p.appliesTo, centsPerPoint: p.centsPerPoint, cardOpenedBefore: date(p.condition?.cardOpenedBefore), description: p.description, effectiveFrom: date(p.effectiveFrom)!, effectiveTo: date(p.effectiveTo), verification: p.verification, sourceUrl: p.sourceUrl ?? null };
    await prisma.portalRate.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
  console.log(`Seeded ${r.programs.length} programs, ${r.cards.length} cards, ${r.benefits.length} benefits, ${r.transferPartners.length} transfer partners.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
