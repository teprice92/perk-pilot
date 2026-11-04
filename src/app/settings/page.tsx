"use client";

import { apiFetch } from "@/lib/api-client";
import { safeHref } from "@/lib/safe-url";
import { CheckCircle2, CircleDashed, CloudDownload, CloudUpload, Download, ExternalLink, KeyRound, Monitor, Moon, RefreshCw, Sun, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Cabin, TravelStyle } from "@/lib/domain/types";
import { DataImportSchema } from "@/lib/domain/schemas";
import { useRules } from "@/lib/hooks/use-rules";
import type { ProviderInfo } from "@/lib/providers/types";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import { applyTheme, PageHeader } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

type Status = { providers: ProviderInfo[]; llm: { configured: boolean; model: string }; database: { configured: boolean }; sync: { configured: boolean } };

const STYLES: TravelStyle[] = ["romantic", "food", "culture", "adventure", "wellness", "nightlife", "nature", "family", "luxury", "shopping"];

export default function SettingsPage() {
  const household = useApp((s) => s.household);
  const update = useApp((s) => s.updateHousehold);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const rules = useRules();
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    apiFetch("/api/providers").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);
  const prefs = household.preferences;
  const setPrefs = (patch: Partial<typeof prefs>) => update({ preferences: { ...prefs, ...patch } });
  const setComfort = (k: keyof typeof prefs.comfort, dollars: number) => setPrefs({ comfort: { ...prefs.comfort, [k]: Math.round(dollars * 100) } });
  const valuationPrograms = rules.programs.filter((p) => p.kind === "bank" || household.travelers.some((t) => t.balances.some((b) => b.programId === p.id)) || household.valuations[p.id] !== undefined);

  return (
    <div>
      <PageHeader eyebrow="Settings & integrations" title="Make it yours" description="Preferences and valuations drive every recommendation. All values are editable and stored with your household." />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Travel preferences">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Preferred cabin">
                <Segmented size="sm" value={prefs.cabin} onChange={(v: Cabin) => setPrefs({ cabin: v })} options={[{ value: "economy", label: "Economy" }, { value: "premium_economy", label: "Premium" }, { value: "business", label: "Business" }, { value: "first", label: "First" }]} />
              </Field>
              <Field label="Maximum stops">
                <Segmented size="sm" value={String(prefs.maxStops) as "0" | "1" | "2"} onChange={(v) => setPrefs({ maxStops: Number(v) })} options={[{ value: "0", label: "Nonstop" }, { value: "1", label: "1 stop" }, { value: "2", label: "2 stops" }]} />
              </Field>
              <Field label="Hotel style">
                <Segmented size="sm" value={prefs.hotelTier} onChange={(v) => setPrefs({ hotelTier: v })} options={[{ value: "upscale", label: "Upscale" }, { value: "luxury", label: "Luxury" }, { value: "any", label: "Any" }]} />
              </Field>
              <Field label="Pace">
                <Segmented size="sm" value={prefs.pace} onChange={(v) => setPrefs({ pace: v })} options={[{ value: "relaxed", label: "Relaxed" }, { value: "balanced", label: "Balanced" }, { value: "packed", label: "Packed" }]} />
              </Field>
              <Field label="Home airport">
                <Input value={household.homeAirport} maxLength={3} onChange={(e) => update({ homeAirport: e.target.value.toUpperCase() })} className="w-24 uppercase" aria-label="Home airport" />
              </Field>
              <Field label="Prefer refundable / changeable bookings">
                <Switch checked={prefs.preferRefundable} onChange={(v) => setPrefs({ preferRefundable: v })} label="Prefer refundable bookings" />
              </Field>
            </div>
            <Field label="Travel styles" className="mt-5">
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => {
                  const on = prefs.styles.includes(s);
                  return <button key={s} aria-pressed={on} onClick={() => setPrefs({ styles: on ? prefs.styles.filter((x) => x !== s) : [...prefs.styles, s] })} className={cn("rounded-full border px-3 py-1 text-xs font-medium capitalize", on ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted")}>{s}</button>;
                })}
              </div>
            </Field>
          </Section>

          <Section title="Point valuations" description="Your baseline cents-per-point for each program. Used for opportunity cost — redeeming below this value is treated as a loss.">
            <div className="grid gap-3 sm:grid-cols-2">
              {valuationPrograms.map((p) => (
                <label key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                  <span className="text-sm">{p.name}</span>
                  <span className="flex items-center gap-1">
                    <input type="number" step="0.05" min="0" max="5" aria-label={`${p.shortName} valuation in cents`} value={household.valuations[p.id] ?? 1} onChange={(e) => update({ valuations: { ...household.valuations, [p.id]: Number(e.target.value) } })} className="w-20 rounded-lg bg-muted px-2 py-1 text-right text-sm tabular outline-none focus:ring-2 focus:ring-accent" />
                    <span className="text-xs text-fg-subtle">¢</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label={`Minimum redemption value (Maximum Savings): ${household.minRedemptionCpp.toFixed(2)}¢`}>
                <input type="range" min="0.5" max="3" step="0.05" value={household.minRedemptionCpp} onChange={(e) => update({ minRedemptionCpp: Number(e.target.value) })} className="w-full accent-[var(--accent)]" aria-label="Minimum redemption value" />
              </Field>
              <Field label="Default trip cash budget (USD, 0 = none)">
                <Input inputMode="numeric" value={household.cashBudgetCents / 100} onChange={(e) => update({ cashBudgetCents: Math.round((Number(e.target.value.replace(/[^\d.]/g, "")) || 0) * 100) })} aria-label="Default trip cash budget" />
              </Field>
            </div>
          </Section>

          <Section title="What comfort is worth to you" description="Monetises quality so Balanced and Luxury plans can weigh a lie-flat seat or a luxury suite against cash and points. Per traveler.">
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["premiumEconomyPerHourCents", "Premium economy, per flight hour"],
                ["businessPerHourCents", "Business class, per flight hour"],
                ["firstPerHourCents", "First class, per flight hour"],
                ["luxuryHotelPerNightCents", "Luxury vs upscale hotel, per night"],
                ["stopPenaltyCents", "Cost of each extra stop"],
                ["hourPenaltyCents", "Cost of each travel hour"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                  <span className="text-sm">{label}</span>
                  <span className="flex items-center gap-1 text-xs text-fg-subtle">$<input type="number" min="0" aria-label={label} value={prefs.comfort[k] / 100} onChange={(e) => setComfort(k, Number(e.target.value))} className="w-20 rounded-lg bg-muted px-2 py-1 text-right text-sm text-fg tabular outline-none focus:ring-2 focus:ring-accent" /></span>
                </label>
              ))}
            </div>
          </Section>

          <DataSection syncConfigured={status?.sync.configured ?? false} automatic={Boolean((status?.sync as { automatic?: boolean } | undefined)?.automatic)} />
        </div>

        <div className="space-y-6">
          <Section title="Appearance">
            <Segmented value={settings.theme} onChange={(v) => { updateSettings({ theme: v }); applyTheme(v); }} options={[{ value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun className="size-3.5" />Light</span> }, { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5" />Dark</span> }, { value: "system", label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-3.5" />System</span> }]} />
          </Section>
          <Section title="Integrations" description="Live providers are configured with server-side environment variables — keys never reach the browser.">
            {!status ? (
              <Skeleton className="h-64" />
            ) : (
              <ul className="space-y-2">
                <IntegrationRow name="AI concierge (Claude)" configured={status.llm.configured} note={status.llm.configured ? `Model: ${status.llm.model}` : "Set ANTHROPIC_API_KEY. Without it, a deterministic planner answers."} />
                <IntegrationRow name="PostgreSQL (rules & sync)" configured={status.database.configured} note={status.database.configured ? "Rules load from the database" : "Set DATABASE_URL to persist rules and household data"} />
                {status.providers.map((p) => (
                  <IntegrationRow key={p.id} name={p.name} configured={p.configured} kind={p.dataKind} note={p.notes} docs={p.docsUrl} env={p.envVars} />
                ))}
              </ul>
            )}
          </Section>
          <Section title="Privacy & security">
            <ul className="space-y-1.5 text-sm text-fg-muted">
              <li>· No card numbers, passwords or loyalty credentials are requested or stored.</li>
              <li>· Your household data stays on this device (IndexedDB) unless you enable sync.</li>
              <li>· API keys live only on the server. The AI sees the household summary needed to answer, never credentials.</li>
              <li>· PerkPilot never transfers points or makes purchases.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function DataSection({ syncConfigured, automatic }: { syncConfigured: boolean; automatic: boolean }) {
  const state = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setToken(localStorage.getItem("pp-sync-token") ?? "");
    } catch {}
  }, []);
  const snapshot = () => ({ household: state.household, usage: state.usage, overrides: state.overrides, trips: state.trips.filter((t) => t.saved), savedAt: new Date().toISOString() });
  const exportAll = () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `perkpilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importAll = async (f: File) => {
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("File is too large to be a PerkPilot backup");
      const parsed = DataImportSchema.safeParse(JSON.parse(await f.text()));
      if (!parsed.success) throw new Error("Not a valid PerkPilot backup");
      const data = parsed.data;
      state.importData(data as Parameters<typeof state.importData>[0]);
      toast("Backup restored", `${data.trips?.length ?? 0} trips imported`);
    } catch (e) {
      toast("Import failed", e instanceof Error ? e.message : "Invalid file", "warning");
    }
  };
  const sync = async (dir: "push" | "pull") => {
    setBusy(true);
    try {
      localStorage.setItem("pp-sync-token", token);
      const res = await apiFetch("/api/sync", { method: dir === "push" ? "PUT" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: dir === "push" ? JSON.stringify(snapshot()) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      if (dir === "pull") {
        if (!data.snapshot) throw new Error("Nothing has been synced yet");
        const snap = DataImportSchema.safeParse(data.snapshot);
        if (!snap.success) throw new Error("The synced data is invalid");
        state.importData(snap.data as Parameters<typeof state.importData>[0]);
      }
      toast(dir === "push" ? "Synced to server" : "Pulled latest household data");
    } catch (e) {
      toast("Sync failed", e instanceof Error ? e.message : "", "warning");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Your data" description="Back up, restore, or sync your household between both travelers' devices.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportAll}><Download /> Export backup</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Import backup</Button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} />
      </div>
      {automatic ? (
        <div className="mt-5 rounded-2xl border border-border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><RefreshCw className="size-4 text-[color:var(--gold)]" /> Household sync is automatic</p>
          <p className="mt-1 text-xs text-fg-muted">Signed-in members of your household share wallet, benefits and saved trips. {state.sync.error ? <span className="text-warning">{state.sync.error}</span> : state.sync.lastSyncedAt ? `Last synced ${new Date(state.sync.lastSyncedAt).toLocaleString()}.` : "Waiting for the first sync."}</p>
        </div>
      ) : (
      <div className="mt-5 rounded-2xl border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4 text-[color:var(--gold)]" /> Household sync {syncConfigured ? <Badge variant="success">Available</Badge> : <Badge>Not configured on server</Badge>}</p>
        <p className="mt-1 text-xs text-fg-muted">Self-hosted deployments can set <code className="rounded bg-muted px-1">PERKPILOT_SYNC_TOKEN</code> and <code className="rounded bg-muted px-1">DATABASE_URL</code>. Enter the same token on both devices.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input type="password" placeholder="Sync token" value={token} onChange={(e) => setToken(e.target.value)} className="max-w-xs" aria-label="Sync token" disabled={!syncConfigured} />
          <Button variant="outline" disabled={!syncConfigured || !token || busy} onClick={() => sync("push")}><CloudUpload /> Push</Button>
          <Button variant="outline" disabled={!syncConfigured || !token || busy} onClick={() => sync("pull")}>{busy ? <RefreshCw className="animate-spin" /> : <CloudDownload />} Pull</Button>
        </div>
      </div>
      )}
    </Section>
  );
}

function IntegrationRow({ name, configured, note, docs, env, kind }: { name: string; configured: boolean; note: string; docs?: string; env?: string[]; kind?: string }) {
  return (
    <li className="rounded-2xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{name}</p>
        {configured ? <Badge variant="success"><CheckCircle2 /> {kind === "demo" ? "Active (demo)" : "Configured"}</Badge> : <Badge variant="outline"><CircleDashed /> Not configured</Badge>}
      </div>
      <p className="mt-1 text-xs text-fg-muted">{note}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
        {env && env.length > 0 && <span>{env.map((e) => <code key={e} className="mr-1 rounded bg-muted px-1">{e}</code>)}</span>}
        {docs && <a href={safeHref(docs)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">Docs <ExternalLink className="size-3" /></a>}
      </div>
    </li>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
      <h2 className="font-display text-xl">{title}</h2>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
