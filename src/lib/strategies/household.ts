import type { BenefitUsage, Household } from "@/lib/domain/types";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import type { OptimizationResult, StrategyId } from "@/lib/optimizer/types";
import type { RulesRepository } from "@/lib/rules/repository";
import { creditStatuses, householdPoints } from "@/lib/wallet";

/**
 * Household points strategies (Phase 4). Deterministic, rule-based advice
 * about how the household's points are owned and best deployed — never a
 * recommendation to spend money or move points speculatively.
 */

export interface StrategyTip {
  id: string;
  kind: "pooling" | "ownership" | "balance" | "valuation" | "bonus" | "credit" | "commitment";
  impact: "high" | "medium" | "low";
  title: string;
  body: string;
  href?: string;
}

export interface TripCommitment {
  name: string;
  departDate: string;
  result: OptimizationResult;
  strategy: StrategyId;
}

export function householdTips(household: Household, rules: RulesRepository, usage: BenefitUsage[], today: string, trips: TripCommitment[] = []): StrategyTip[] {
  const tips: StrategyTip[] = [];
  const name = (id: string) => household.travelers.find((t) => t.id === id)?.name ?? id;
  const points = householdPoints(household, rules);

  for (const p of points.list) {
    const program = p.program;
    if (!program) continue;
    const pooling = program.pooling;

    // 1. Pooling: split balances in a combinable program.
    if (pooling.householdTransfer === "allowed" && p.holders.length > 1) {
      tips.push({
        id: `pool-${p.programId}`,
        kind: "pooling",
        impact: "medium",
        title: `${program.shortName}: combine only when you book`,
        body: `${p.holders.map((h) => `${name(h.travelerId)} has ${formatPoints(h.points)}`).join(", ")}. ${pooling.description} Move points just before a specific redemption rather than in advance, so each of you keeps flexibility.`,
      });
    }

    // 2. Ownership: non-combinable bank points held by one person.
    if (program.kind === "bank" && pooling.householdTransfer === "not_allowed") {
      for (const h of p.holders) {
        const cardIds = rules.cards.filter((c) => c.programId === program.id).map((c) => c.id);
        const aus = household.travelers.filter((t) => t.id !== h.travelerId && t.cards.some((c) => cardIds.includes(c.cardId) && c.role === "authorized_user" && c.primaryTravelerId === h.travelerId));
        tips.push({
          id: `own-${p.programId}-${h.travelerId}`,
          kind: "ownership",
          impact: "medium",
          title: `${program.shortName} belongs to ${name(h.travelerId)}`,
          body: aus.length
            ? `${formatPoints(h.points)} ${program.shortName} can't be moved into another person's account, but transfers can generally go to an eligible authorized user's airline or hotel account — ${aus.map((a) => a.name).join(", ")} ${aus.length > 1 ? "are" : "is"} an authorized user (tenure rules may apply). Most airline programs also let ${name(h.travelerId)} book award seats for others.`
            : `${formatPoints(h.points)} ${program.shortName} can only fund transfers into ${name(h.travelerId)}'s own loyalty accounts. That's usually fine: most airline programs let the account holder book award seats for companions.`,
        });
      }
    }

    // 3. Stranded or top-up-able loyalty balances.
    if (program.kind !== "bank") {
      const paths = rules.transferPathsTo(program.id).filter((t) => points.list.some((b) => b.programId === t.fromProgram));
      tips.push({
        id: `bal-${p.programId}`,
        kind: "balance",
        impact: "low",
        title: paths.length ? `${program.shortName}: top up rather than transfer in full` : `${program.shortName}: no transfer partner in your wallet`,
        body: paths.length
          ? `You hold ${formatPoints(p.total)} ${program.currency}. When an award needs more, PerkPilot transfers only the shortfall from ${paths.map((t) => rules.programName(t.fromProgram)).join(" or ")} (${paths.map((t) => `${t.ratioFrom}:${t.ratioTo}`).join(", ")}).`
          : `You hold ${formatPoints(p.total)} ${program.currency} that your cards can't top up. Plan to use it on a redemption it fully covers, and check the program's expiration policy.`,
      });
    }
  }

  // 4. Valuation below a guaranteed redemption floor.
  for (const card of rules.cards) {
    const holder = household.travelers.find((t) => t.cards.some((c) => c.cardId === card.id && c.role === "primary"));
    if (!holder) continue;
    const opened = holder.cards.find((c) => c.cardId === card.id)?.openedDate;
    const floor = Math.max(rules.portalRate(card.id, "flight", opened)?.centsPerPoint ?? 0, rules.portalRate(card.id, "hotel", opened)?.centsPerPoint ?? 0);
    const v = household.valuations[card.programId];
    if (floor && v !== undefined && v < floor) {
      tips.push({
        id: `val-${card.programId}`,
        kind: "valuation",
        impact: "high",
        title: `Your ${rules.programName(card.programId)} valuation is below a fixed floor`,
        body: `You value ${rules.programName(card.programId)} at ${v}¢, but ${card.name.replace("®", "")} redemptions through the issuer portal are worth ${floor}¢ under the current rules (unverified). Consider raising your baseline so PerkPilot doesn't undervalue these points.`,
        href: "/settings",
      });
    }
  }

  // 5. Active transfer bonuses from banks the household holds.
  for (const bonus of rules.activeBonuses(today)) {
    if (!points.list.some((p) => p.programId === bonus.fromProgram)) continue;
    const used = trips.filter((t) => Object.values(t.result.plans[t.strategy].components).some((c) => c.option.transfer?.toProgram === bonus.toProgram && c.option.transfer.fromProgram === bonus.fromProgram));
    const daysLeft = Math.round((Date.parse(bonus.endDate) - Date.parse(today)) / 86_400_000);
    tips.push({
      id: `bonus-${bonus.id}`,
      kind: "bonus",
      impact: used.length ? "high" : "low",
      title: `+${bonus.bonusPercent}% ${rules.programName(bonus.fromProgram)} → ${rules.programName(bonus.toProgram)} (${daysLeft} days left)`,
      body: `${used.length ? `Your plan for ${used.map((t) => t.name).join(", ")} already uses this transfer — book before ${bonus.endDate} to keep the lower points cost. ` : "Only worth using for a specific, confirmed redemption. "}${bonus.verification === "demo" ? "This is a demo promotion, not a real offer." : ""}`,
      href: "/benefits",
    });
  }

  // 6. Credits: enrollment gaps and resets.
  for (const c of creditStatuses(household, usage, rules, today)) {
    if (c.needsEnrollment) {
      tips.push({ id: `enroll-${c.benefit.id}-${c.travelerId}`, kind: "credit", impact: "medium", title: `Enroll in ${c.benefit.name}`, body: `${name(c.travelerId)} hasn't confirmed enrollment, so PerkPilot doesn't count this ${formatUSD(c.amountCents)} credit. Enroll with the issuer, then confirm on the Benefits page.`, href: "/benefits" });
    } else if (c.remainingCents > 0 && c.daysLeft <= 30 && !["every_4_years", "every_4_5_years"].includes(c.benefit.period)) {
      tips.push({ id: `reset-${c.benefit.id}-${c.travelerId}`, kind: "credit", impact: "low", title: `${c.benefit.name} resets in ${c.daysLeft} days`, body: `${formatUSD(c.remainingCents)} left for ${name(c.travelerId)}. Use it only for something you'd buy anyway.`, href: "/benefits" });
    }
  }

  // 7. Upcoming trips that together need more points than you have.
  const upcoming = trips.filter((t) => t.departDate >= today);
  const committed: Record<string, number> = {};
  for (const t of upcoming) for (const [k, v] of Object.entries(t.result.plans[t.strategy].totals.pointsByProgram)) committed[k] = (committed[k] ?? 0) + v;
  for (const [programId, need] of Object.entries(committed)) {
    const have = points.list.find((p) => p.programId === programId)?.total ?? 0;
    if (need > have) {
      tips.push({
        id: `commit-${programId}`,
        kind: "commitment",
        impact: "high",
        title: `Upcoming trips need more ${rules.programName(programId)} than you hold`,
        body: `Your ${upcoming.length} upcoming plans use ${formatPoints(need)} ${rules.programName(programId)} in total; the household has ${formatPoints(have)}. Re-optimize one trip, or switch it to a strategy that uses cash for some components.`,
        href: "/trips",
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => rank[a.impact] - rank[b.impact]);
}
