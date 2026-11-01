"use client";

import { ArrowUpRight, CalendarDays, Crown, Lightbulb, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import type { OptimizationResult, Plan, StrategyId } from "@/lib/optimizer/types";
import { STRATEGIES } from "@/lib/optimizer/types";
import type { RulesRepository } from "@/lib/rules/repository";
import type { StrategyTip } from "@/lib/strategies/household";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cabinLabel } from "./helpers";
import { Panel } from "./summary";

export function UpgradesPanel({ plan, rules }: { plan: Plan; rules: RulesRepository }) {
  if (!plan.upgrades.length) return null;
  const verdict = { worth_it: { label: "Worth it", v: "success" as const }, consider: { label: "Consider", v: "accent" as const }, poor_value: { label: "Poor value", v: "outline" as const } };
  return (
    <Panel icon={<Crown />} title="Premium cabin analysis">
      <p className="mb-3 text-sm text-fg-muted">What moving each flight up one cabin would cost on the same flight, judged against your comfort settings and point valuations.</p>
      <div className="space-y-2">
        {plan.upgrades.map((u) => (
          <div key={u.slot} className="rounded-2xl border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{cabinLabel(u.fromCabin)} → {cabinLabel(u.toCabin)}</p>
              <Badge variant={verdict[u.verdict].v}>{verdict[u.verdict].label}</Badge>
            </div>
            <p className="mt-1 text-xs text-fg-muted">{u.note}</p>
            <p className="mt-1 text-[11px] tabular text-fg-subtle">
              Δ cash {u.extraCashCents >= 0 ? "+" : "−"}{formatUSD(Math.abs(u.extraCashCents))} · Δ points {Object.entries(u.extraPoints).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? "+" : ""}${formatPoints(v)} ${rules.programName(k)}`).join(", ") || "none"} · Δ retail {formatUSD(u.extraRetailCents)}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function DateAlternativesPanel({ result, selected, onRerun, busyShift }: { result: OptimizationResult; selected: StrategyId; onRerun: (shift: number) => void; busyShift: number | null }) {
  const alts = result.dateAlternatives ?? [];
  if (!alts.length) return null;
  const base = result.plans;
  const rows = [{ shiftDays: 0, departDate: result.request.departDate, returnDate: result.request.returnDate, plans: Object.fromEntries(STRATEGIES.map((s) => [s, { cashCents: base[s].totals.cashCents, effectiveCostCents: base[s].totals.effectiveCostCents, pointsByProgram: base[s].totals.pointsByProgram }])) as (typeof alts)[number]["plans"] }, ...alts].sort((a, b) => a.shiftDays - b.shiftDays);
  const best = [...rows].sort((a, b) => a.plans[selected].effectiveCostCents - b.plans[selected].effectiveCostCents)[0]!;
  return (
    <Panel icon={<CalendarDays />} title="Flexible-date optimization">
      <p className="mb-3 text-sm text-fg-muted">
        Every strategy was fully re-optimized for nearby dates (same trip length).{" "}
        {best.shiftDays === 0 ? <>Your dates are already the best value for <strong className="text-fg">{base[selected].title}</strong>.</> : <>For <strong className="text-fg">{base[selected].title}</strong>, leaving <strong className="text-fg">{formatDate(best.departDate, { weekday: "short", month: "short", day: "numeric" })}</strong> lowers the effective cost by {formatUSD(base[selected].totals.effectiveCostCents - best.plans[selected].effectiveCostCents)}.</>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
              <th className="py-2 font-medium">Dates</th>
              {STRATEGIES.map((s) => <th key={s} className="py-2 font-medium">{base[s].title}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.shiftDays} className={cn("border-t border-border/70", r.shiftDays === 0 && "bg-accent-soft/50")}>
                <td className="py-2.5">
                  {formatDate(r.departDate, { month: "short", day: "numeric" })} – {formatDate(r.returnDate, { month: "short", day: "numeric" })}
                  <span className="block text-[11px] text-fg-subtle">{r.shiftDays === 0 ? "Your dates" : `${r.shiftDays > 0 ? "+" : ""}${r.shiftDays} day${Math.abs(r.shiftDays) > 1 ? "s" : ""}`}</span>
                </td>
                {STRATEGIES.map((s) => (
                  <td key={s} className={cn("py-2.5 tabular", r === best && s === selected && "font-semibold text-success")}>
                    {formatUSD(r.plans[s].cashCents)}
                    <span className="block text-[11px] text-fg-subtle">eff. {formatUSD(r.plans[s].effectiveCostCents, { compact: true })}</span>
                  </td>
                ))}
                <td className="py-2.5 text-right">
                  {r.shiftDays !== 0 && (
                    <Button size="sm" variant="ghost" onClick={() => onRerun(r.shiftDays)} disabled={busyShift !== null}>
                      {busyShift === r.shiftDays ? <Loader2 className="animate-spin" /> : null} Use dates
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-fg-subtle">Cash out of pocket, with effective cost (cash + points at your valuations − guaranteed perks) underneath. Demo estimates.</p>
    </Panel>
  );
}

export function TipsPanel({ tips, title = "Household points strategy", limit = 5 }: { tips: StrategyTip[]; title?: string; limit?: number }) {
  if (!tips.length) return null;
  return (
    <Panel icon={<Lightbulb />} title={title}>
      <ul className="space-y-2">
        {tips.slice(0, limit).map((t) => (
          <li key={t.id} className="rounded-2xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{t.title}</p>
              <Badge variant={t.impact === "high" ? "warning" : t.impact === "medium" ? "accent" : "neutral"}>{t.impact}</Badge>
            </div>
            <p className="mt-1 text-xs text-fg-muted">{t.body}</p>
            {t.href && (
              <Link href={t.href} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline">
                Open <ArrowUpRight className="size-3" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
