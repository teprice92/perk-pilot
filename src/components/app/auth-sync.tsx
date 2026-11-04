"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api-client";
import { DataImportSchema } from "@/lib/domain/schemas";
import { useApp, type SavedTrip } from "@/lib/store/app-store";
import { useAuth } from "@/lib/store/auth-store";
import { mergeSnapshot, type Snapshot } from "@/lib/store/sync-merge";

const PUSH_DELAY_MS = 3_000;
const POLL_MS = 60_000;

let applying = false;

function localSnapshot() {
  const s = useApp.getState();
  return { household: s.household, usage: s.usage, overrides: s.overrides, trips: s.trips.filter((t) => t.saved), savedAt: new Date().toISOString(), baseVersion: s.sync.version ?? null };
}

function applyServer(snapshot: unknown, version: string | null) {
  const parsed = DataImportSchema.safeParse(snapshot);
  if (!parsed.success) {
    useApp.getState().setSync({ error: "The household data on the server is invalid" });
    return false;
  }
  const firstSync = !useApp.getState().sync.version;
  const merged = mergeSnapshot({ trips: useApp.getState().trips }, parsed.data as unknown as Snapshot, { firstSync });
  applying = true;
  try {
    useApp.getState().applySnapshot(merged as { household: Snapshot["household"]; usage: NonNullable<Snapshot["usage"]>; overrides: NonNullable<Snapshot["overrides"]>; trips: SavedTrip[] });
  } finally {
    applying = false;
  }
  useApp.getState().setSync({ version, error: undefined, lastSyncedAt: new Date().toISOString() });
  // Upload anything that only existed locally (first sync, or newer local edits).
  if (firstSync || merged.trips.some((t) => t.saved && !(parsed.data.trips ?? []).some((x) => x.id === t.id && x.updatedAt === t.updatedAt))) {
    useApp.getState().setSync({ pending: true });
    setTimeout(() => void pushNow().catch(() => {}), 0);
  }
  return true;
}

export async function pushNow(retry = true): Promise<void> {
  const res = await apiFetch("/api/sync", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(localSnapshot()) });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    useApp.getState().setSync({ version: data.version, lastSyncedAt: new Date().toISOString(), pending: false, error: undefined });
  } else if (res.status === 409 && data.snapshot && retry) {
    // Someone else saved first: merge their changes, then save ours on top.
    if (applyServer(data.snapshot, data.version)) await pushNow(false);
  } else {
    useApp.getState().setSync({ pending: false, error: data.error ?? "Sync failed" });
  }
}

export async function pullNow(): Promise<void> {
  const res = await apiFetch("/api/sync", { cache: "no-store" });
  if (!res.ok) return;
  const data = (await res.json()) as { snapshot: unknown; version: string | null };
  if (!data.snapshot) {
    await pushNow(); // first device for this household
    return;
  }
  if (data.version !== useApp.getState().sync.version) applyServer(data.snapshot, data.version);
}

/**
 * Loads the session and, when logins are enabled, keeps this device's data in
 * sync with the signed-in user's household (shared with a spouse who joined it).
 */
export function AuthAndSync() {
  const refresh = useAuth((s) => s.refresh);
  const authEnabled = useAuth((s) => s.authEnabled);
  const userId = useAuth((s) => s.user?.id);
  const hasHousehold = useAuth((s) => Boolean(s.user?.householdId));
  const hydrated = useApp((s) => s.hydrated);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hydrated || !authEnabled || !userId || !hasHousehold) return;
    let cancelled = false;
    (async () => {
      const st = useApp.getState();
      // A different account on this device: never mix households.
      if (st.sync.accountId && st.sync.accountId !== userId) st.resetLocalData();
      useApp.getState().setSync({ accountId: userId });
      try {
        await pullNow();
      } catch {
        /* offline — local data still works */
      }
      if (!cancelled) ready.current = true;
    })();

    const unsub = useApp.subscribe((s, prev) => {
      if (!ready.current || applying) return;
      if (s.household === prev.household && s.usage === prev.usage && s.overrides === prev.overrides && s.trips === prev.trips) return;
      useApp.getState().setSync({ pending: true });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void pushNow().catch(() => useApp.getState().setSync({ error: "Offline — will sync when you're back online" })), PUSH_DELAY_MS);
    });
    const poll = () => {
      if (document.visibilityState === "visible" && ready.current && !useApp.getState().sync.pending) void pullNow().catch(() => {});
    };
    const interval = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("online", poll);
    return () => {
      cancelled = true;
      ready.current = false;
      unsub();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("online", poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [hydrated, authEnabled, userId, hasHousehold]);

  return null;
}

/** Save pending changes, end the session and clear this device's household data. */
export async function signOut(everywhere = false): Promise<void> {
  try {
    if (useApp.getState().sync.pending) await pushNow();
  } catch {
    /* best effort */
  }
  await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ everywhere }) }).catch(() => {});
  useApp.getState().resetLocalData();
  window.location.assign("/login");
}
