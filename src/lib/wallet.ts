import type { Benefit, BenefitUsage, Household } from "@/lib/domain/types";
import { periodFor } from "@/lib/calc/periods";
import type { RulesRepository } from "@/lib/rules/repository";

export interface CreditStatus {
  benefit: Benefit;
  travelerId: string;
  periodKey: string;
  periodLabel: string;
  periodEnd: string;
  amountCents: number;
  usedCents: number;
  remainingCents: number;
  enrolled: boolean;
  needsEnrollment: boolean;
  daysLeft: number;
}

export function householdPoints(h: Household, rules: RulesRepository) {
  const byProgram = new Map<string, { programId: string; total: number; holders: Array<{ travelerId: string; points: number }> }>();
  for (const t of h.travelers) {
    for (const b of t.balances) {
      const e = byProgram.get(b.programId) ?? { programId: b.programId, total: 0, holders: [] };
      e.total += b.points;
      e.holders.push({ travelerId: t.id, points: b.points });
      byProgram.set(b.programId, e);
    }
  }
  const list = [...byProgram.values()].map((p) => ({
    ...p,
    program: rules.program(p.programId),
    valueCents: Math.round(p.total * (h.valuations[p.programId] ?? 1)),
  }));
  list.sort((a, b) => b.valueCents - a.valueCents);
  return { list, totalValueCents: list.reduce((a, p) => a + p.valueCents, 0) };
}

export function creditStatuses(h: Household, usage: BenefitUsage[], rules: RulesRepository, today: string): CreditStatus[] {
  const out: CreditStatus[] = [];
  for (const b of rules.benefits({ date: today })) {
    if (!b.amountCents) continue;
    for (const t of h.travelers) {
      const owned = t.cards.find((c) => c.cardId === b.cardId && (c.role === "primary" || b.appliesToAuthorizedUsers));
      if (!owned) continue;
      const period = periodFor(b.period, today, owned.openedDate?.slice(5));
      const rec = usage.find((u) => u.benefitId === b.id && u.travelerId === t.id && u.periodKey === period.key);
      const anyEnrolled = usage.some((u) => u.benefitId === b.id && u.travelerId === t.id && u.enrolled);
      const used = rec?.usedCents ?? 0;
      out.push({
        benefit: b,
        travelerId: t.id,
        periodKey: period.key,
        periodLabel: period.label,
        periodEnd: period.end,
        amountCents: b.amountCents,
        usedCents: used,
        remainingCents: Math.max(0, b.amountCents - used),
        enrolled: anyEnrolled || !b.enrollmentRequired,
        needsEnrollment: b.enrollmentRequired && !anyEnrolled,
        daysLeft: Math.round((Date.parse(period.end) - Date.parse(today)) / 86_400_000),
      });
    }
  }
  return out;
}
