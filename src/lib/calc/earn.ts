import type { Household, SpendCategory } from "@/lib/domain/types";
import type { RulesRepository } from "@/lib/rules/repository";
import { isEffective } from "@/lib/rules/repository";

export interface EarnSuggestion {
  cardId: string;
  cardName: string;
  multiplier: number;
  pointsEarned: number;
  programId: string;
}

/** Which card in the household earns the most on a cash purchase. Informational only. */
export function bestCardForSpend(
  rules: RulesRepository,
  household: Household,
  category: SpendCategory,
  spendCents: number,
): EarnSuggestion | null {
  const owned = new Set(household.travelers.flatMap((t) => t.cards.map((c) => c.cardId)));
  let best: EarnSuggestion | null = null;
  for (const card of rules.cards) {
    if (!owned.has(card.id)) continue;
    const rule =
      card.earnRules.find((r) => r.category === category && isEffective(r, rules.asOf)) ??
      card.earnRules.find((r) => r.category === "other" && isEffective(r, rules.asOf));
    if (!rule) continue;
    const pts = Math.floor((spendCents / 100) * rule.multiplier);
    if (!best || pts > best.pointsEarned) {
      best = { cardId: card.id, cardName: card.name, multiplier: rule.multiplier, pointsEarned: pts, programId: card.programId };
    }
  }
  return best;
}
