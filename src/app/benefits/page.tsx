"use client";

import { Bell, BellOff, CalendarClock, CheckCircle2, ExternalLink, History, Pencil, PiggyBank, Plane, Sparkles, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatUSD } from "@/lib/calc/money";
import type { Benefit } from "@/lib/domain/types";
import { useRules } from "@/lib/hooks/use-rules";
import { useApp } from "@/lib/store/app-store";
import { cn, formatDate, todayISO } from "@/lib/utils";
import { creditStatuses, type CreditStatus } from "@/lib/wallet";
import { VerificationBadge } from "@/components/app/badges";
import { PageHeader } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog, Progress, Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

export default function BenefitsPage() {
  const rules = useRules();
  const household = useApp((s) => s.household);
  const usage = useApp((s) => s.usage);
  const trips = useApp((s) => s.trips);
  const hydrated = useApp((s) => s.hydrated);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const setUsage = useApp((s) => s.setUsage);
  const today = todayISO();
  const [card, setCard] = useState<string>("all");
  const [view, setView] = useState<"credits" | "perks" | "transfers" | "history">("credits");
  const [logFor, setLogFor] = useState<CreditStatus | null>(null);
  const [editFor, setEditFor] = useState<Benefit | null>(null);

  const credits = useMemo(() => creditStatuses(household, usage, rules, today), [household, usage, rules, today]);
  const upcoming = trips.filter((t) => t.result.request.departDate >= today);
  const tripUse = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of upcoming) {
      for (const b of t.result.plans[t.selectedStrategy].benefits) m.set(b.benefitId, [...(m.get(b.benefitId) ?? []), t.name]);
    }
    return m;
  }, [upcoming]);
  const owned = new Set(household.travelers.flatMap((t) => t.cards.map((c) => c.cardId)));
  const shownCredits = credits.filter((c) => card === "all" || c.benefit.cardId === card);
  const remaining = credits.filter((c) => c.enrolled).reduce((a, c) => a + c.remainingCents, 0);
  const expiringSoon = credits.filter((c) => c.remainingCents > 0 && c.daysLeft <= settings.reminderDays && c.benefit.period !== "every_4_years");
  const perks = rules.benefits({ date: today }).filter((b) => !b.amountCents && owned.has(b.cardId) && (card === "all" || b.cardId === card));
  const travelerName = (id: string) => household.travelers.find((t) => t.id === id)?.name ?? id;

  // Optional local notifications for expiring credits (once per day).
  useEffect(() => {
    if (!hydrated || !settings.notifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const key = "pp-last-reminder";
      if (localStorage.getItem(key) === today || expiringSoon.length === 0) return;
      localStorage.setItem(key, today);
      new Notification("PerkPilot reminder", { body: `${expiringSoon.length} card credit(s) reset within ${settings.reminderDays} days. Only use them for things you'd buy anyway.`, icon: "/icons/icon-192.png" });
    } catch {}
  }, [hydrated, settings.notifications, settings.reminderDays, expiringSoon.length, today]);

  const toggleNotifications = async (v: boolean) => {
    if (v && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") {
        toast("Notifications blocked", "Enable them in your browser settings to get reminders.", "warning");
        return;
      }
    }
    updateSettings({ notifications: v });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Benefits & credits"
        title="What your cards give back"
        description="Track statement credits, enrollment and expirations across the household. PerkPilot only counts credits you can realistically use — and never suggests spending just to use one."
      />
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile icon={<PiggyBank />} label="Credits remaining this period" value={formatUSD(remaining)} sub="Enrolled credits only" />
          <Tile icon={<CalendarClock />} label={`Resetting within ${settings.reminderDays} days`} value={String(expiringSoon.length)} sub={expiringSoon.length ? formatUSD(expiringSoon.reduce((a, c) => a + c.remainingCents, 0)) + " unused" : "Nothing urgent"} tone={expiringSoon.length ? "warning" : undefined} />
          <Tile icon={<Plane />} label="Relevant to upcoming trips" value={String(tripUse.size)} sub={upcoming.length ? `${upcoming.length} upcoming trip${upcoming.length > 1 ? "s" : ""}` : "Plan a trip to see matches"} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Segmented value={view} onChange={setView} options={[{ value: "credits", label: "Credits" }, { value: "perks", label: "Perks" }, { value: "transfers", label: "Transfers" }, { value: "history", label: "Rule history" }]} />
            <Select aria-label="Filter by card" value={card} onChange={(e) => setCard(e.target.value)} className="w-auto rounded-full">
              <option value="all">All cards</option>
              {rules.cards.filter((c) => owned.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-border bg-elevated px-4 py-2 text-sm">
            {settings.notifications ? <Bell className="size-4 text-accent" /> : <BellOff className="size-4 text-fg-subtle" />}
            <span>Expiry reminders</span>
            <Switch checked={settings.notifications} onChange={toggleNotifications} label="Expiry reminders" />
            <Select aria-label="Reminder window" value={String(settings.reminderDays)} onChange={(e) => updateSettings({ reminderDays: Number(e.target.value) })} className="h-7 w-auto rounded-full py-0 text-xs">
              {[7, 14, 30, 45].map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
          </div>
        </div>

        {!hydrated ? (
          <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}</div>
        ) : view === "credits" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {shownCredits.sort((a, b) => Number(b.remainingCents > 0) - Number(a.remainingCents > 0) || a.daysLeft - b.daysLeft).map((c) => {
              const relevant = tripUse.get(c.benefit.id);
              const pct = (c.usedCents / c.amountCents) * 100;
              return (
                <article key={`${c.benefit.id}-${c.travelerId}`} className={cn("rounded-3xl border bg-elevated p-5 shadow-card", relevant ? "border-accent" : "border-border")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{rules.card(c.benefit.cardId)?.issuer} · {travelerName(c.travelerId)}</p>
                      <h3 className="mt-0.5 font-semibold">{c.benefit.name}</h3>
                      <p className="mt-0.5 text-xs text-fg-muted">{c.benefit.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-2xl tabular">{formatUSD(c.remainingCents)}</p>
                      <p className="text-[11px] text-fg-subtle">of {formatUSD(c.amountCents)} left</p>
                    </div>
                  </div>
                  <Progress value={pct} className="mt-4" tone={c.remainingCents === 0 ? "gold" : c.daysLeft <= settings.reminderDays ? "warning" : "accent"} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                    <span>{c.periodLabel} · resets after {formatDate(c.periodEnd, { month: "short", day: "numeric", year: "numeric" })} ({c.daysLeft} days)</span>
                    <span>{formatUSD(c.usedCents)} used</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <VerificationBadge status={c.benefit.verification} lastVerified={c.benefit.lastVerified} />
                    {c.benefit.enrollmentRequired && (c.needsEnrollment ? <Badge variant="warning">Enrollment not confirmed</Badge> : <Badge variant="success"><CheckCircle2 /> Enrolled</Badge>)}
                    {c.benefit.bookingChannel && c.benefit.bookingChannel !== "any" && <Badge variant="outline">Via {c.benefit.bookingChannel.replace("_", " ")}</Badge>}
                    {c.benefit.minNights && <Badge variant="outline">{c.benefit.minNights}+ nights</Badge>}
                    {relevant && <Badge variant="accent"><Sparkles /> Used in {relevant.join(", ")}</Badge>}
                  </div>
                  <ul className="mt-3 space-y-0.5 text-[11px] text-fg-subtle">
                    {[...c.benefit.eligibility, ...c.benefit.limitations].slice(0, 3).map((x) => <li key={x}>· {x}</li>)}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLogFor(c)}>Log usage</Button>
                    {c.benefit.enrollmentRequired && (
                      <Button size="sm" variant={c.needsEnrollment ? "accent" : "ghost"} onClick={() => { setUsage({ benefitId: c.benefit.id, travelerId: c.travelerId, periodKey: c.periodKey, usedCents: c.usedCents, enrolled: c.needsEnrollment }); toast(c.needsEnrollment ? "Enrollment confirmed" : "Marked as not enrolled"); }}>
                        {c.needsEnrollment ? "I've enrolled" : "Undo enrollment"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditFor(c.benefit)} aria-label="Edit rule"><Pencil /> Edit rule</Button>
                    {c.benefit.sourceUrl && <a href={c.benefit.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">Official terms <ExternalLink className="size-3" /></a>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : view === "perks" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {perks.map((b) => (
              <article key={b.id} className={cn("rounded-3xl border bg-elevated p-5 shadow-card", tripUse.get(b.id) ? "border-accent" : "border-border")}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-fg-muted"><Ticket className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{rules.card(b.cardId)?.issuer} · {b.category.replace("_", " ")}</p>
                    <h3 className="font-semibold">{b.name}</h3>
                    <p className="mt-0.5 text-sm text-fg-muted">{b.description}</p>
                    {b.perks && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {b.perks.map((p) => <li key={p.name} className="flex items-center gap-1.5">{p.kind === "guaranteed" ? <CheckCircle2 className="size-3.5 text-success" /> : <span className="size-3.5 rounded-full border border-dashed border-fg-subtle" />}{p.name}<span className="text-fg-subtle">{p.kind === "guaranteed" ? "" : " · when available"}</span></li>)}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <VerificationBadge status={b.verification} lastVerified={b.lastVerified} />
                      {b.enrollmentRequired && <Badge variant="warning">Enrollment required</Badge>}
                      {tripUse.get(b.id) && <Badge variant="accent"><Sparkles /> {tripUse.get(b.id)!.join(", ")}</Badge>}
                    </div>
                    <ul className="mt-2 space-y-0.5 text-[11px] text-fg-subtle">{[...b.eligibility, ...b.limitations].map((x) => <li key={x}>· {x}</li>)}</ul>
                    {b.enrollmentRequired && (
                      <EnrollToggle benefit={b} />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : view === "transfers" ? (
          <TransferPartners />
        ) : (
          <RuleHistory />
        )}
        <p className="pb-4 text-xs text-fg-subtle">{rules.dataset.disclaimer}</p>
      </div>

      <LogUsageDialog status={logFor} onClose={() => setLogFor(null)} />
      <EditRuleDialog benefit={editFor} onClose={() => setEditFor(null)} />
    </div>
  );
}

function EnrollToggle({ benefit }: { benefit: Benefit }) {
  const household = useApp((s) => s.household);
  const usage = useApp((s) => s.usage);
  const setUsage = useApp((s) => s.setUsage);
  const holders = household.travelers.filter((t) => t.cards.some((c) => c.cardId === benefit.cardId && (c.role === "primary" || benefit.appliesToAuthorizedUsers)));
  return (
    <div className="mt-3 space-y-2">
      {holders.map((t) => {
        const enrolled = usage.some((u) => u.benefitId === benefit.id && u.travelerId === t.id && u.enrolled);
        return (
          <label key={t.id} className="flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2 text-xs">
            <span>{t.name} enrolled</span>
            <Switch checked={enrolled} label={`${t.name} enrolled in ${benefit.name}`} onChange={(v) => setUsage({ benefitId: benefit.id, travelerId: t.id, periodKey: "ongoing", usedCents: 0, enrolled: v })} />
          </label>
        );
      })}
    </div>
  );
}

function LogUsageDialog({ status, onClose }: { status: CreditStatus | null; onClose: () => void }) {
  const setUsage = useApp((s) => s.setUsage);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"add" | "set">("add");
  useEffect(() => {
    setAmount("");
  }, [status]);
  if (!status) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  const cents = Math.round((Number(amount) || 0) * 100);
  const next = Math.min(status.amountCents, Math.max(0, mode === "add" ? status.usedCents + cents : cents));
  return (
    <Dialog open onClose={onClose} title={`Log usage · ${status.benefit.name}`}>
      <form onSubmit={(e) => { e.preventDefault(); setUsage({ benefitId: status.benefit.id, travelerId: status.travelerId, periodKey: status.periodKey, usedCents: next, enrolled: status.enrolled }); toast("Credit usage updated", `${formatUSD(status.amountCents - next)} remaining for ${status.periodLabel}`); onClose(); }} className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: "add", label: "Add a charge" }, { value: "set", label: "Set total used" }]} />
        <div>
          <Label htmlFor="amt">Amount (USD)</Label>
          <Input id="amt" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className="mt-1" />
        </div>
        <p className="text-sm text-fg-muted">New total used: <strong className="text-fg">{formatUSD(next)}</strong> of {formatUSD(status.amountCents)} for {status.periodLabel}.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditRuleDialog({ benefit, onClose }: { benefit: Benefit | null; onClose: () => void }) {
  const overrides = useApp((s) => s.overrides);
  const setOverride = useApp((s) => s.setOverride);
  const clearOverride = useApp((s) => s.clearOverride);
  const [amount, setAmount] = useState("");
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (!benefit) return;
    setAmount(benefit.amountCents ? String(benefit.amountCents / 100) : "");
    setVerified(benefit.verification === "verified");
  }, [benefit]);
  if (!benefit) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  const has = overrides.some((o) => o.benefitId === benefit.id);
  return (
    <Dialog open onClose={onClose} title={`Edit rule · ${benefit.name}`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setOverride({ benefitId: benefit.id, amountCents: amount ? Math.round(Number(amount) * 100) : undefined, verification: verified ? "verified" : "unverified", lastVerified: verified ? todayISO() : undefined }); toast("Rule updated", "Future optimizations use your value."); onClose(); }}>
        <p className="text-sm text-fg-muted">Card terms change. If the official page shows a different amount, record it here — it applies to this household on this device.</p>
        <div>
          <Label htmlFor="ramt">Credit amount per period (USD)</Label>
          <Input id="ramt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1" />
        </div>
        <label className="flex items-center justify-between rounded-xl bg-muted/70 px-3 py-2.5 text-sm">
          <span>I verified this against the official source today</span>
          <Switch checked={verified} onChange={setVerified} label="Mark verified" />
        </label>
        {benefit.sourceUrl && <a href={benefit.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">Open official terms <ExternalLink className="size-3.5" /></a>}
        <div className="flex justify-between gap-2">
          {has ? <Button variant="ghost" onClick={() => { clearOverride(benefit.id); onClose(); toast("Restored default rule"); }}>Restore default</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function TransferPartners() {
  const rules = useRules();
  const today = todayISO();
  const bonuses = rules.activeBonuses(today);
  const upcoming = rules.dataset.transferBonuses.filter((b) => b.startDate > today);
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-[color-mix(in_oklab,var(--gold)_40%,transparent)] bg-gold-soft/50 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-[color:var(--gold)]" /> Transfer bonus monitor</h3>
        {bonuses.length === 0 && upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">No active transfer bonuses in the rules database.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[...bonuses, ...upcoming].map((b) => (
              <li key={b.id} className="rounded-2xl border border-border bg-elevated p-3 text-sm">
                <p className="font-medium">+{b.bonusPercent}% {rules.programName(b.fromProgram)} → {rules.programName(b.toProgram)}</p>
                <p className="text-xs text-fg-muted">{b.startDate} to {b.endDate} · {b.startDate > today ? "upcoming" : `ends in ${Math.round((Date.parse(b.endDate) - Date.parse(today)) / 86_400_000)} days`}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5"><VerificationBadge status={b.verification} lastVerified={b.lastVerified} />{b.notes && <span className="text-[11px] text-fg-subtle">{b.notes}</span>}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-fg-subtle">Only transfer for a specific, confirmed redemption — a bonus isn't a reason to move points speculatively.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {["amex-mr", "chase-ur"].map((bank) => (
          <div key={bank} className="overflow-hidden rounded-3xl border border-border bg-elevated shadow-card">
            <h3 className="border-b border-border p-4 font-display text-lg">{rules.program(bank)?.name}</h3>
            <table className="w-full text-sm">
              <tbody>
                {rules.transferPartners(bank, today).sort((a, b) => (rules.program(a.toProgram)?.kind ?? "").localeCompare(rules.program(b.toProgram)?.kind ?? "") || a.toProgram.localeCompare(b.toProgram)).map((t) => {
                  const bonus = rules.activeBonus(t.fromProgram, t.toProgram, today);
                  return (
                    <tr key={t.id} className="border-t border-border/60 first:border-0">
                      <td className="px-4 py-2.5">{rules.program(t.toProgram)?.name}<span className="block text-[11px] capitalize text-fg-subtle">{rules.program(t.toProgram)?.kind} · {t.transferTime}</span></td>
                      <td className="px-4 py-2.5 text-right tabular">{t.ratioFrom.toLocaleString()}:{t.ratioTo.toLocaleString()}{bonus && <Badge variant="gold" className="ml-2">+{bonus.bonusPercent}%</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleHistory() {
  const rules = useRules();
  const today = todayISO();
  const all = [...rules.allBenefits()].sort((a, b) => a.cardId.localeCompare(b.cardId) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-elevated shadow-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
            <th className="p-4 font-medium"><History className="mr-1 inline size-3.5" />Rule</th>
            <th className="p-4 font-medium">Amount</th>
            <th className="p-4 font-medium">Effective</th>
            <th className="p-4 font-medium">Status</th>
            <th className="p-4 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {all.map((b) => {
            const active = b.effectiveFrom <= today && (!b.effectiveTo || b.effectiveTo >= today);
            return (
              <tr key={b.id} className={cn("border-t border-border/70", !active && "text-fg-subtle")}>
                <td className="p-4"><span className="font-medium">{b.name}</span><span className="block text-xs text-fg-subtle">{rules.card(b.cardId)?.name}</span></td>
                <td className="p-4 tabular">{b.amountCents ? `${formatUSD(b.amountCents)} / ${b.period.replace(/_/g, " ")}` : "—"}</td>
                <td className="p-4 tabular text-xs">{b.effectiveFrom} → {b.effectiveTo ?? "present"} {active ? <Badge variant="success" className="ml-1">Active</Badge> : <Badge className="ml-1">{b.effectiveFrom > today ? "Future" : "Superseded"}</Badge>}</td>
                <td className="p-4"><VerificationBadge status={b.verification} lastVerified={b.lastVerified} /></td>
                <td className="p-4">{b.sourceUrl && <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Link <ExternalLink className="size-3" /></a>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "warning" }) {
  return (
    <div className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
      <p className={cn("flex items-center gap-2 text-xs font-medium text-fg-muted [&_svg]:size-4", tone === "warning" ? "[&_svg]:text-warning" : "[&_svg]:text-[color:var(--gold)]")}>{icon}{label}</p>
      <p className="font-display mt-2 text-3xl tabular">{value}</p>
      <p className="text-xs text-fg-subtle">{sub}</p>
    </div>
  );
}
