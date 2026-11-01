import { buildSlots } from "./slots";
import type { OptimizationResult } from "./types";

/**
 * Upgrades results saved by earlier versions (single-city, no slots, no
 * upgrades/date alternatives) so current UI code can rely on the new fields.
 */
export function normalizeResult(r: OptimizationResult): OptimizationResult {
  const plans = Object.fromEntries(Object.entries(r.plans).map(([k, p]) => [k, { ...p, upgrades: p.upgrades ?? [] }])) as OptimizationResult["plans"];
  return {
    ...r,
    plans,
    destinations: r.destinations?.length ? r.destinations : [r.destination],
    slots: r.slots?.length ? r.slots : buildSlots(r.request),
    dateAlternatives: r.dateAlternatives ?? [],
  };
}
