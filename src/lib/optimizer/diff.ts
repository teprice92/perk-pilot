import type { OptimizationResult, StrategyId } from "./types";

export interface PlanDiff {
  strategy: StrategyId;
  title: string;
  cashDeltaCents: number;
  pointsDelta: Record<string, number>;
  changedSlots: Array<{ slot: string; label: string; before: string; after: string }>;
}

/** Compare two optimization results for the same trip (trip re-optimization). */
export function diffResults(before: OptimizationResult, after: OptimizationResult): PlanDiff[] {
  const labels = new Map((after.slots ?? []).map((s) => [s.slot, s.label]));
  return (Object.keys(after.plans) as StrategyId[]).map((s) => {
    const a = before.plans[s];
    const b = after.plans[s];
    const programs = new Set([...Object.keys(a.totals.pointsByProgram), ...Object.keys(b.totals.pointsByProgram)]);
    const pointsDelta: Record<string, number> = {};
    for (const p of programs) {
      const d = (b.totals.pointsByProgram[p] ?? 0) - (a.totals.pointsByProgram[p] ?? 0);
      if (d) pointsDelta[p] = d;
    }
    const describe = (r: OptimizationResult, slot: string) => {
      const c = r.plans[s].components[slot];
      if (!c) return "—";
      const offer = r.flights[slot]?.find((f) => f.id === c.option.offerId);
      const hotel = r.hotels.find((h) => h.id === c.option.offerId);
      return `${offer ? `${offer.carrierName} ${offer.cabin.replace("_", " ")}` : hotel?.name ?? ""} · ${c.option.label}`;
    };
    const changedSlots = Object.keys(b.components)
      .map((slot) => ({ slot, label: labels.get(slot) ?? slot, before: describe(before, slot), after: describe(after, slot) }))
      .filter((x) => x.before !== x.after);
    return { strategy: s, title: b.title, cashDeltaCents: b.totals.cashCents - a.totals.cashCents, pointsDelta, changedSlots };
  });
}
