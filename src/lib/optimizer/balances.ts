import type { Household } from "@/lib/domain/types";
import { formatPoints } from "@/lib/calc/money";
import type { RulesRepository } from "@/lib/rules/repository";
import type { PointsDraw } from "./types";

export interface Allocation {
  programId: string;
  travelerId: string;
  points: number;
}

export interface AllocationResult {
  feasible: boolean;
  allocations: Allocation[];
  steps: string[];
  reason?: string;
}

/**
 * Models program-specific ownership. Points are never assumed to be shareable:
 * a program only pools across household members when its PoolingRule says
 * `allowed` (and then only up to `maxMembers` others). Everything else must be
 * satisfied by a single traveler's own balance.
 */
export function householdBalances(household: Household, rules: RulesRepository) {
  const byProgram = new Map<string, Array<{ travelerId: string; name: string; points: number }>>();
  for (const t of household.travelers) {
    for (const b of t.balances) {
      if (b.points <= 0) continue;
      const list = byProgram.get(b.programId) ?? [];
      list.push({ travelerId: t.id, name: t.name, points: b.points });
      byProgram.set(b.programId, list);
    }
  }
  for (const list of byProgram.values()) list.sort((a, b) => b.points - a.points);

  const pooling = (programId: string) => rules.program(programId)?.pooling;
  const canPool = (programId: string) => pooling(programId)?.householdTransfer === "allowed";

  const total = (programId: string) => (byProgram.get(programId) ?? []).reduce((a, x) => a + x.points, 0);

  const maxAccessible = (programId: string) => {
    const list = byProgram.get(programId) ?? [];
    if (!list.length) return 0;
    if (canPool(programId)) {
      const max = pooling(programId)?.maxMembers;
      const take = max === undefined ? list.length : max + 1;
      return list.slice(0, take).reduce((a, x) => a + x.points, 0);
    }
    return list[0]!.points;
  };

  const nameOf = (id: string) => household.travelers.find((t) => t.id === id)?.name ?? id;

  function allocate(draws: PointsDraw[]): AllocationResult {
    const grouped = new Map<string, PointsDraw[]>();
    for (const d of draws) grouped.set(d.programId, [...(grouped.get(d.programId) ?? []), d]);
    const allocations: Allocation[] = [];
    const steps: string[] = [];

    for (const [programId, ds] of grouped) {
      const holders = byProgram.get(programId) ?? [];
      const need = ds.reduce((a, d) => a + d.points, 0);
      const programName = rules.programName(programId);
      if (!holders.length) return { feasible: false, allocations, steps, reason: `No one holds ${programName}` };

      if (canPool(programId)) {
        if (need > maxAccessible(programId)) {
          return { feasible: false, allocations, steps, reason: `Not enough ${programName} even after combining` };
        }
        // The largest holder books; others combine points into that account if needed.
        const booker = holders[0]!;
        let remaining = need;
        const fromBooker = Math.min(booker.points, remaining);
        allocations.push({ programId, travelerId: booker.travelerId, points: fromBooker });
        remaining -= fromBooker;
        for (const other of holders.slice(1)) {
          if (remaining <= 0) break;
          const take = Math.min(other.points, remaining);
          allocations.push({ programId, travelerId: other.travelerId, points: take });
          steps.push(
            `Combine ${formatPoints(take)} ${programName} from ${other.name} into ${booker.name}'s account first (${programName} allows combining with one household member).`,
          );
          remaining -= take;
        }
        continue;
      }

      // Non-poolable: each draw must come entirely from one traveler.
      const n = holders.length;
      const combos = Math.pow(n, ds.length);
      let found: number[] | null = null;
      for (let c = 0; c < combos && !found; c++) {
        const assign: number[] = [];
        let x = c;
        for (let i = 0; i < ds.length; i++) {
          assign.push(x % n);
          x = Math.floor(x / n);
        }
        const used = new Array<number>(n).fill(0);
        ds.forEach((d, i) => (used[assign[i]!] += d.points));
        if (used.every((u, i) => u <= holders[i]!.points)) found = assign;
      }
      if (!found) {
        return {
          feasible: false,
          allocations,
          steps,
          reason: `${programName} points can't be combined between household members, and no single member has enough`,
        };
      }
      ds.forEach((d, i) => allocations.push({ programId, travelerId: holders[found![i]!]!.travelerId, points: d.points }));
    }
    return { feasible: true, allocations, steps };
  }

  return { total, maxAccessible, allocate, nameOf, byProgram };
}

export type HouseholdBalances = ReturnType<typeof householdBalances>;
