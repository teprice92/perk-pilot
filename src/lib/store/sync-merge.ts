import type { BenefitOverride, BenefitUsage, Household } from "@/lib/domain/types";
import type { SavedTrip } from "./app-store";

export interface Snapshot {
  household: Household;
  usage?: BenefitUsage[];
  overrides?: BenefitOverride[];
  trips?: SavedTrip[];
  savedAt?: string;
}

/**
 * Merge a server snapshot into local data. Household settings, benefit usage
 * and overrides come from the server (it's the shared source of truth); saved
 * trips are unioned by id keeping the most recently updated copy; local
 * unsaved drafts are kept on this device only.
 */
export function mergeSnapshot(local: { trips: SavedTrip[] }, server: Snapshot, opts: { firstSync?: boolean } = {}) {
  const byId = new Map<string, SavedTrip>();
  for (const t of server.trips ?? []) byId.set(t.id, t);
  for (const t of local.trips) {
    const s = byId.get(t.id);
    if (!s) {
      // Local drafts stay on this device. Saved trips missing on the server were
      // deleted by another device — except on this device's first sync, when
      // they were created before syncing and must be uploaded, not dropped.
      if (!t.saved || opts.firstSync) byId.set(t.id, t);
      continue;
    }
    if (t.updatedAt > s.updatedAt) byId.set(t.id, t);
  }
  return {
    household: server.household,
    usage: server.usage ?? [],
    overrides: server.overrides ?? [],
    trips: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}
