"use client";

import { Info, Lock, Plus, RotateCcw, Trash2, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import type { OwnedCard, Traveler } from "@/lib/domain/types";
import { useRules } from "@/lib/hooks/use-rules";
import { useApp } from "@/lib/store/app-store";
import { householdPoints } from "@/lib/wallet";
import { CardArt } from "@/components/app/card-art";
import { PageHeader } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

export default function WalletPage() {
  const household = useApp((s) => s.household);
  const hydrated = useApp((s) => s.hydrated);
  const updateHousehold = useApp((s) => s.updateHousehold);
  const loadDemo = useApp((s) => s.loadDemo);
  const startPersonal = useApp((s) => s.startPersonal);
  const rules = useRules();
  const points = useMemo(() => householdPoints(household, rules), [household, rules]);
  const [confirm, setConfirm] = useState<"demo" | "fresh" | null>(null);
  const nameOf = (id: string) => household.travelers.find((t) => t.id === id)?.name ?? id;

  const poolingText = (programId: string) => {
    const p = rules.program(programId)?.pooling;
    if (!p) return { label: "Unknown", variant: "outline" as const, text: "" };
    if (p.householdTransfer === "allowed") return { label: p.maxMembers ? `Combinable · ${p.maxMembers} member${p.maxMembers > 1 ? "s" : ""}` : "Combinable", variant: "success" as const, text: p.description };
    if (p.householdTransfer === "conditional") return { label: "Conditional", variant: "warning" as const, text: p.description };
    if (p.householdTransfer === "not_allowed") return { label: "Not combinable", variant: "danger" as const, text: p.description };
    return { label: "Rules unknown", variant: "outline" as const, text: p.description };
  };

  return (
    <div>
      <PageHeader
        eyebrow="Household rewards wallet"
        title={
          <input
            aria-label="Household name"
            value={household.name}
            onChange={(e) => updateHousehold({ name: e.target.value })}
            className="w-full bg-transparent font-display outline-none"
          />
        }
        description="Enter balances manually — PerkPilot never asks for card numbers, passwords or loyalty logins. Points are modelled per owner; they're only combined when a program's rules allow it."
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm("demo")}><RotateCcw /> Load demo data</Button>
            <Button variant="primary" onClick={() => setConfirm("fresh")}><UserRound /> Start fresh</Button>
          </>
        }
      />

      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6">
        {household.mode === "demo" && (
          <p className="flex items-center gap-2 rounded-2xl bg-[color-mix(in_oklab,var(--warning)_9%,var(--bg-elevated))] px-4 py-3 text-sm text-fg-muted">
            <Info className="size-4 text-warning" /> This is the sample demo household. Edit anything, or start fresh with your own balances.
          </p>
        )}

        {/* Combined household view */}
        <section className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Combined household rewards</h2>
              <p className="text-sm text-fg-muted">Value uses your baseline valuations (edit in Settings). Ownership stays with each traveler.</p>
            </div>
            <p className="font-display text-3xl tabular">{formatUSD(points.totalValueCents)}</p>
          </div>
          {!hydrated ? (
            <Skeleton className="h-40" />
          ) : points.list.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">No balances yet — add them per traveler below.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                    <th className="py-2 font-medium">Program</th>
                    <th className="py-2 font-medium">Household total</th>
                    <th className="py-2 font-medium">Owned by</th>
                    <th className="py-2 font-medium">Pooling</th>
                    <th className="py-2 text-right font-medium">Est. value</th>
                  </tr>
                </thead>
                <tbody>
                  {points.list.map((p) => {
                    const pool = poolingText(p.programId);
                    return (
                      <tr key={p.programId} className="border-t border-border/70">
                        <td className="py-3">
                          <span className="font-medium">{p.program?.name ?? p.programId}</span>
                          <span className="block text-xs capitalize text-fg-subtle">{p.program?.kind}</span>
                        </td>
                        <td className="py-3 font-semibold tabular">{formatPoints(p.total)}</td>
                        <td className="py-3 text-xs text-fg-muted">{p.holders.map((h) => `${nameOf(h.travelerId)} ${formatPoints(h.points, true)}`).join(" · ")}</td>
                        <td className="py-3"><Badge variant={pool.variant} title={pool.text}>{pool.label}</Badge></td>
                        <td className="py-3 text-right tabular">{formatUSD(p.valueCents)} <span className="text-xs text-fg-subtle">@{household.valuations[p.programId] ?? 1}¢</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {household.travelers.map((t) => (
            <TravelerPanel key={t.id} traveler={t} />
          ))}
        </div>

        <section className="rounded-3xl border border-border bg-elevated p-5 text-sm shadow-card">
          <h3 className="mb-2 flex items-center gap-2 font-semibold"><Lock className="size-4 text-[color:var(--gold)]" /> Future account connections</h3>
          <p className="text-fg-muted">
            Balances are entered manually in this version. PerkPilot&apos;s provider layer is designed for read-only, OAuth-based aggregation where issuers or loyalty programs support it — credentials would never be stored by PerkPilot. See <code className="rounded bg-muted px-1">docs/PROVIDERS.md</code>.
          </p>
        </section>
      </div>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "demo" ? "Load demo household?" : "Start with a blank household?"}>
        <p className="text-sm text-fg-muted">This replaces the current household, balances and benefit tracking on this device. Saved trips are kept.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button onClick={() => { if (confirm === "demo") loadDemo(); else startPersonal(); setConfirm(null); toast(confirm === "demo" ? "Demo household loaded" : "Blank household ready", confirm === "demo" ? undefined : "Add your cards and balances below."); }}>Continue</Button>
        </div>
      </Dialog>
    </div>
  );
}

function TravelerPanel({ traveler: t }: { traveler: Traveler }) {
  const rules = useRules();
  const household = useApp((s) => s.household);
  const updateTraveler = useApp((s) => s.updateTraveler);
  const setBalance = useApp((s) => s.setBalance);
  const removeBalance = useApp((s) => s.removeBalance);
  const [newProgram, setNewProgram] = useState("");
  const [newPoints, setNewPoints] = useState("");
  const [cardId, setCardId] = useState("");
  const [role, setRole] = useState<OwnedCard["role"]>("primary");
  const [opened, setOpened] = useState("");
  const [loyProgram, setLoyProgram] = useState("");
  const [loyLast4, setLoyLast4] = useState("");
  const [loyStatus, setLoyStatus] = useState("");

  const others = household.travelers.filter((x) => x.id !== t.id);
  const available = rules.programs.filter((p) => !t.balances.some((b) => b.programId === p.id));

  return (
    <section className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: t.color }}>{t.initials}</span>
        <div className="min-w-0 flex-1">
          <input aria-label="Traveler name" value={t.name} onChange={(e) => updateTraveler(t.id, { name: e.target.value, initials: e.target.value.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?" })} className="w-full bg-transparent font-display text-2xl outline-none" />
          <label className="flex items-center gap-2 text-xs text-fg-subtle">
            Home airport
            <input aria-label={`${t.name} home airport`} value={t.homeAirport} maxLength={3} onChange={(e) => updateTraveler(t.id, { homeAirport: e.target.value.toUpperCase() })} className="w-12 rounded border border-border bg-transparent px-1 uppercase" />
          </label>
        </div>
      </div>

      {/* Cards */}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Cards</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {t.cards.map((c) => {
          const card = rules.card(c.cardId);
          if (!card) return null;
          return (
            <div key={c.cardId} className="relative">
              <CardArt card={card} holder={t.name} role={c.role} />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-fg-subtle">
                <span>{c.role === "authorized_user" ? `AU on ${household.travelers.find((x) => x.id === c.primaryTravelerId)?.name ?? "—"}'s account` : c.openedDate ? `Opened ${c.openedDate}` : "Primary"}</span>
                <button onClick={() => updateTraveler(t.id, { cards: t.cards.filter((x) => x.cardId !== c.cardId) })} className="text-fg-subtle hover:text-danger" aria-label={`Remove ${card.name}`}><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!cardId || t.cards.some((c) => c.cardId === cardId)) return;
          const primary = role === "authorized_user" ? others.find((o) => o.cards.some((c) => c.cardId === cardId && c.role === "primary"))?.id : undefined;
          updateTraveler(t.id, { cards: [...t.cards, { cardId, role, openedDate: role === "primary" && opened ? opened : undefined, primaryTravelerId: primary }] });
          setCardId("");
          setOpened("");
        }}
      >
        <Select aria-label="Card" value={cardId} onChange={(e) => setCardId(e.target.value)} className="col-span-2 sm:col-span-1">
          <option value="">Add a card…</option>
          {rules.cards.filter((c) => !t.cards.some((x) => x.cardId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Card role" value={role} onChange={(e) => setRole(e.target.value as OwnedCard["role"])}>
          <option value="primary">Primary</option>
          <option value="authorized_user">Authorized user</option>
        </Select>
        <Input type="date" aria-label="Card opened date (optional)" title="Opened date — used for card-year credits and transitional rules" value={opened} onChange={(e) => setOpened(e.target.value)} disabled={role !== "primary"} />
        <Button type="submit" variant="outline" disabled={!cardId}><Plus /> Add</Button>
      </form>

      {/* Balances */}
      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Points & miles balances</h3>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {t.balances.length === 0 && <li className="p-4 text-center text-sm text-fg-subtle">No balances yet</li>}
        {t.balances.map((b) => {
          const p = rules.program(b.programId);
          return (
            <li key={b.programId} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p?.name ?? b.programId}</p>
                <p className="text-[11px] text-fg-subtle">Updated {new Date(b.updatedAt).toLocaleDateString()}</p>
              </div>
              <input
                aria-label={`${p?.shortName ?? b.programId} balance`}
                inputMode="numeric"
                value={b.points.toLocaleString("en-US")}
                onChange={(e) => setBalance(t.id, b.programId, Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
                className="w-32 rounded-lg border border-transparent bg-muted px-2 py-1 text-right text-sm font-semibold tabular outline-none focus:border-accent"
              />
              <button onClick={() => removeBalance(t.id, b.programId)} className="text-fg-subtle hover:text-danger" aria-label={`Remove ${p?.shortName} balance`}><Trash2 className="size-4" /></button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newProgram) return;
          setBalance(t.id, newProgram, Number(newPoints.replace(/[^\d]/g, "")) || 0);
          setNewProgram("");
          setNewPoints("");
        }}
      >
        <Select aria-label="Program" value={newProgram} onChange={(e) => setNewProgram(e.target.value)}>
          <option value="">Add program…</option>
          {(["bank", "airline", "hotel"] as const).map((k) => (
            <optgroup key={k} label={k === "bank" ? "Bank points" : k === "airline" ? "Airlines" : "Hotels"}>
              {available.filter((p) => p.kind === k).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          ))}
        </Select>
        <Input aria-label="Points" inputMode="numeric" placeholder="Points" value={newPoints} onChange={(e) => setNewPoints(e.target.value)} className="w-32" />
        <Button type="submit" variant="outline" disabled={!newProgram}><Plus /></Button>
      </form>

      {/* Loyalty */}
      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Loyalty accounts & elite status</h3>
      <div className="flex flex-wrap gap-2">
        {t.loyalty.map((l) => (
          <span key={l.programId} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
            <span className="font-medium">{rules.programName(l.programId)}</span>
            {l.memberLast4 && <span className="text-fg-subtle">••{l.memberLast4}</span>}
            {l.eliteStatus && <Badge variant="gold">{l.eliteStatus}</Badge>}
            <button onClick={() => updateTraveler(t.id, { loyalty: t.loyalty.filter((x) => x.programId !== l.programId) })} aria-label={`Remove ${rules.programName(l.programId)}`} className="text-fg-subtle hover:text-danger"><Trash2 className="size-3" /></button>
          </span>
        ))}
      </div>
      <form
        className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loyProgram) return;
          updateTraveler(t.id, { loyalty: [...t.loyalty.filter((x) => x.programId !== loyProgram), { programId: loyProgram, memberLast4: loyLast4.slice(-4) || undefined, eliteStatus: loyStatus || undefined }] });
          setLoyProgram("");
          setLoyLast4("");
          setLoyStatus("");
        }}
      >
        <Select aria-label="Loyalty program" value={loyProgram} onChange={(e) => setLoyProgram(e.target.value)} className="col-span-2 sm:col-span-1">
          <option value="">Add loyalty account…</option>
          {rules.programs.filter((p) => p.kind !== "bank").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input aria-label="Last 4 of member number (optional)" placeholder="Last 4" maxLength={4} value={loyLast4} onChange={(e) => setLoyLast4(e.target.value.replace(/[^\w]/g, ""))} />
        <Input aria-label="Elite status (optional)" placeholder="Elite status" value={loyStatus} onChange={(e) => setLoyStatus(e.target.value)} />
        <Button type="submit" variant="outline" disabled={!loyProgram}><Plus /></Button>
      </form>
      <p className="mt-2 text-[11px] text-fg-subtle">Only the last 4 characters of a member number are stored, for your reference.</p>

    </section>
  );
}
