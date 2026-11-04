"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BenefitOverride, BenefitUsage, Household, PointsBalance, Traveler } from "@/lib/domain/types";
import { blankHousehold, demoHousehold, demoUsage } from "@/lib/demo/household";
import { buildItinerary, moveItem, reoptimizeItinerary, type BookingStatus, type Itinerary } from "@/lib/itinerary";
import { normalizeResult } from "@/lib/optimizer/compat";
import type { OptimizationResult, StrategyId } from "@/lib/optimizer/types";
import { idbStorage } from "./idb-storage";

export interface SavedTrip {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  saved: boolean;
  result: OptimizationResult;
  selectedStrategy: StrategyId;
  itinerary: Itinerary;
  itineraryEdited: boolean;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  notifications: boolean;
  reminderDays: number;
  dismissedDemoBanner: boolean;
}

interface AppState {
  hydrated: boolean;
  household: Household;
  usage: BenefitUsage[];
  overrides: BenefitOverride[];
  trips: SavedTrip[];
  settings: Settings;
  lastSyncedAt?: string;
  /** Household sync bookkeeping (logins mode). */
  sync: { accountId?: string; version?: string | null; lastSyncedAt?: string; pending?: boolean; error?: string };
  setSync: (patch: Partial<AppState["sync"]>) => void;
  /** Wipe this device's household data (used when a different account signs in, or on sign-out). */
  resetLocalData: () => void;
  applySnapshot: (data: { household: Household; usage: BenefitUsage[]; overrides: BenefitOverride[]; trips: SavedTrip[] }) => void;

  setHydrated: () => void;
  setHousehold: (h: Household) => void;
  updateHousehold: (patch: Partial<Household>) => void;
  updateTraveler: (id: string, patch: Partial<Traveler>) => void;
  setBalance: (travelerId: string, programId: string, points: number) => void;
  removeBalance: (travelerId: string, programId: string) => void;
  setUsage: (u: Omit<BenefitUsage, "updatedAt">) => void;
  setOverride: (o: BenefitOverride) => void;
  clearOverride: (benefitId: string) => void;
  addTrip: (result: OptimizationResult) => string;
  updateTrip: (id: string, patch: Partial<SavedTrip>) => void;
  deleteTrip: (id: string) => void;
  replaceTripResult: (id: string, result: OptimizationResult, rebuildItinerary: boolean) => void;
  selectStrategy: (id: string, s: StrategyId, rebuildItinerary: boolean) => void;
  moveItineraryItem: (tripId: string, itemId: string, toDate: string) => void;
  setItemStatus: (tripId: string, itemId: string, status: BookingStatus) => void;
  removeItineraryItem: (tripId: string, itemId: string) => void;
  setItinerary: (tripId: string, itin: Itinerary) => void;
  reoptimize: (tripId: string) => string[];
  updateSettings: (patch: Partial<Settings>) => void;
  loadDemo: () => void;
  startPersonal: () => void;
  importData: (data: { household: Household; usage?: BenefitUsage[]; overrides?: BenefitOverride[]; trips?: SavedTrip[] }) => void;
}

const nowIso = () => new Date().toISOString();

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      household: demoHousehold(),
      usage: demoUsage(),
      overrides: [],
      trips: [],
      settings: { theme: "system", notifications: false, reminderDays: 14, dismissedDemoBanner: false },
      sync: {},
      setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
      resetLocalData: () => set({ household: blankHousehold(), usage: [], overrides: [], trips: [], sync: {} }),
      applySnapshot: (data) => set({ household: data.household, usage: data.usage, overrides: data.overrides, trips: data.trips.map((t) => ({ ...t, result: normalizeResult(t.result) })) }),

      setHydrated: () => set({ hydrated: true }),
      setHousehold: (household) => set({ household }),
      updateHousehold: (patch) => set((s) => ({ household: { ...s.household, ...patch } })),
      updateTraveler: (id, patch) =>
        set((s) => ({
          household: { ...s.household, travelers: s.household.travelers.map((t) => (t.id === id ? { ...t, ...patch } : t)) },
        })),
      setBalance: (travelerId, programId, points) =>
        set((s) => ({
          household: {
            ...s.household,
            travelers: s.household.travelers.map((t) => {
              if (t.id !== travelerId) return t;
              const existing = t.balances.find((b) => b.programId === programId);
              const balance: PointsBalance = { programId, points: Math.max(0, Math.round(points)), updatedAt: nowIso() };
              return { ...t, balances: existing ? t.balances.map((b) => (b.programId === programId ? balance : b)) : [...t.balances, balance] };
            }),
          },
        })),
      removeBalance: (travelerId, programId) =>
        set((s) => ({
          household: {
            ...s.household,
            travelers: s.household.travelers.map((t) => (t.id === travelerId ? { ...t, balances: t.balances.filter((b) => b.programId !== programId) } : t)),
          },
        })),
      setUsage: (u) =>
        set((s) => {
          const rest = s.usage.filter((x) => !(x.benefitId === u.benefitId && x.travelerId === u.travelerId && x.periodKey === u.periodKey));
          return { usage: [...rest, { ...u, updatedAt: nowIso() }] };
        }),
      setOverride: (o) => set((s) => ({ overrides: [...s.overrides.filter((x) => x.benefitId !== o.benefitId), o] })),
      clearOverride: (benefitId) => set((s) => ({ overrides: s.overrides.filter((x) => x.benefitId !== benefitId) })),
      addTrip: (raw) => {
        const result = normalizeResult(raw);
        const trip: SavedTrip = {
          id: result.id,
          name: `${(result.destinations ?? [result.destination]).map((d) => d.name.split(/ & /)[0]).join(" + ")} · ${new Date(`${result.request.departDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          saved: false,
          result,
          selectedStrategy: result.recommended,
          itinerary: buildItinerary(result, result.recommended),
          itineraryEdited: false,
        };
        // Keep unsaved drafts bounded so storage does not grow forever.
        const drafts = get().trips.filter((t) => !t.saved).slice(0, 4);
        const saved = get().trips.filter((t) => t.saved);
        set({ trips: [trip, ...drafts, ...saved] });
        return trip.id;
      },
      updateTrip: (id, patch) => set((s) => ({ trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowIso() } : t)) })),
      deleteTrip: (id) => set((s) => ({ trips: s.trips.filter((t) => t.id !== id) })),
      replaceTripResult: (id, raw, rebuild) =>
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== id) return t;
            const result = normalizeResult({ ...raw, id });
            return { ...t, result, itinerary: rebuild ? buildItinerary(result, t.selectedStrategy) : t.itinerary, itineraryEdited: rebuild ? false : t.itineraryEdited, updatedAt: nowIso() };
          }),
        })),
      selectStrategy: (id, strategy, rebuild) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === id
              ? {
                  ...t,
                  selectedStrategy: strategy,
                  itinerary: rebuild ? buildItinerary(t.result, strategy) : t.itinerary,
                  itineraryEdited: rebuild ? false : t.itineraryEdited,
                  updatedAt: nowIso(),
                }
              : t,
          ),
        })),
      moveItineraryItem: (tripId, itemId, toDate) =>
        set((s) => ({
          trips: s.trips.map((t) => (t.id === tripId ? { ...t, itinerary: moveItem(t.itinerary, itemId, toDate), itineraryEdited: true, updatedAt: nowIso() } : t)),
        })),
      setItemStatus: (tripId, itemId, status) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === tripId
              ? { ...t, itinerary: { ...t.itinerary, days: t.itinerary.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, status } : i)) })) }, updatedAt: nowIso() }
              : t,
          ),
        })),
      removeItineraryItem: (tripId, itemId) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === tripId
              ? { ...t, itinerary: { ...t.itinerary, days: t.itinerary.days.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId || i.anchored) })) }, itineraryEdited: true, updatedAt: nowIso() }
              : t,
          ),
        })),
      setItinerary: (tripId, itinerary) =>
        set((s) => ({ trips: s.trips.map((t) => (t.id === tripId ? { ...t, itinerary, itineraryEdited: true, updatedAt: nowIso() } : t)) })),
      reoptimize: (tripId) => {
        const trip = get().trips.find((t) => t.id === tripId);
        if (!trip) return [];
        const { itinerary, changes } = reoptimizeItinerary(trip.itinerary);
        get().updateTrip(tripId, { itinerary });
        return changes;
      },
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      loadDemo: () => set({ household: demoHousehold(), usage: demoUsage(), overrides: [] }),
      startPersonal: () => set({ household: blankHousehold(), usage: [], overrides: [] }),
      importData: (data) =>
        set((s) => ({
          household: data.household,
          usage: data.usage ?? s.usage,
          overrides: data.overrides ?? s.overrides,
          trips: data.trips ? data.trips.map((t) => ({ ...t, result: normalizeResult(t.result) })) : s.trips,
        })),
    }),
    {
      name: "perkpilot-state",
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as { trips?: SavedTrip[] };
        if (version < 2 && state?.trips) state.trips = state.trips.map((t) => ({ ...t, result: normalizeResult(t.result) }));
        return state as never;
      },
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ household: s.household, usage: s.usage, overrides: s.overrides, trips: s.trips, settings: s.settings, lastSyncedAt: s.lastSyncedAt, sync: s.sync }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

export function useTrip(id: string | null | undefined) {
  return useApp((s) => s.trips.find((t) => t.id === id));
}
