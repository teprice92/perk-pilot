"use client";

import { motion } from "motion/react";
import { Check, Crown, PiggyBank, Scale } from "lucide-react";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import type { OptimizationResult, StrategyId } from "@/lib/optimizer/types";
import { STRATEGIES } from "@/lib/optimizer/types";
import type { RulesRepository } from "@/lib/rules/repository";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/app/badges";
import { cabinLabel } from "./helpers";

const ICON: Record<StrategyId, React.ReactNode> = { savings: <PiggyBank />, luxury: <Crown />, balanced: <Scale /> };

export function StrategyCompare({ result, selected, onSelect, rules }: { result: OptimizationResult; selected: StrategyId; onSelect: (s: StrategyId) => void; rules: RulesRepository }) {
  return (
    <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Optimization strategy">
      {STRATEGIES.map((s) => {
        const p = result.plans[s];
        const on = s === selected;
        const flight = p.components.outbound!.option;
        const hotelNames = result.slots.filter((x) => x.kind === "hotel").map((x) => result.hotels.find((h) => h.id === p.components[x.slot]?.option.offerId)?.name).filter(Boolean);
        const hotel = p.components.hotel!.option;
        return (
          <motion.button
            key={s}
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(s)}
            whileTap={{ scale: 0.99 }}
            className={cn(
              "relative flex flex-col rounded-3xl border p-5 text-left transition-all",
              on ? "border-accent bg-elevated shadow-float ring-4 ring-[color-mix(in_oklab,var(--accent)_12%,transparent)]" : "border-border bg-elevated/70 shadow-card hover:border-border-strong",
            )}
          >
            {s === result.recommended && <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-b from-[#e3c992] to-[#b8924a] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#1a1305]">Recommended</span>}
            <div className="flex items-center justify-between">
              <span className={cn("grid size-9 place-items-center rounded-xl [&_svg]:size-[18px]", on ? "bg-accent text-accent-fg" : "bg-muted text-fg-muted")}>{ICON[s]}</span>
              {on && <Check className="size-5 text-accent" />}
            </div>
            <h3 className="font-display mt-3 text-xl">{p.title}</h3>
            <p className="mt-1 text-xs text-fg-muted">{p.tagline}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">Cash out of pocket</dt>
                <dd className="font-display text-2xl tabular">{formatUSD(p.totals.cashCents)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">Est. retail value</dt>
                <dd className="font-display text-2xl tabular text-fg-muted">{formatUSD(p.totals.retailCents, { compact: true })}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">Points</dt>
                <dd className="tabular">
                  {Object.keys(p.totals.pointsByProgram).length
                    ? Object.entries(p.totals.pointsByProgram).map(([k, v]) => `${formatPoints(v)} ${rules.programName(k)}`).join(" + ")
                    : "No points used"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-fg-muted">
              <p className="truncate">✈ {cabinLabel(flight.cabin)} · {flight.label}</p>
              <p className="truncate">⌂ {hotelNames.length > 1 ? hotelNames.join(" · ") : `${hotelNames[0]} · ${hotel.label}`}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ConfidenceBadge confidence={p.confidence} showScore={false} />
              {!p.withinBudget && <span className="rounded-full bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] px-2 py-0.5 text-[11px] text-warning">Over budget</span>}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

export function ComparisonTable({ result, rules }: { result: OptimizationResult; rules: RulesRepository }) {
  const rows: Array<{ label: string; get: (s: StrategyId) => string }> = [
    { label: "Cash out of pocket", get: (s) => formatUSD(result.plans[s].totals.cashCents) },
    { label: "Estimated retail value", get: (s) => formatUSD(result.plans[s].totals.retailCents) },
    { label: "Estimated cash savings*", get: (s) => formatUSD(result.plans[s].totals.estimatedSavingsCents) },
    { label: "Amex MR used", get: (s) => formatPoints(result.plans[s].totals.pointsByProgram["amex-mr"] ?? 0) },
    { label: "Chase UR used", get: (s) => formatPoints(result.plans[s].totals.pointsByProgram["chase-ur"] ?? 0) },
    { label: "Card credits applied", get: (s) => formatUSD(result.plans[s].totals.creditsCents) },
    { label: "Guaranteed perks (est.)", get: (s) => formatUSD(result.plans[s].totals.perksValueCents) },
    { label: "Points at your valuation", get: (s) => formatUSD(result.plans[s].totals.pointsValueAtBaselineCents) },
    { label: "Effective cost†", get: (s) => formatUSD(result.plans[s].totals.effectiveCostCents) },
    ...result.slots.map((info) => ({
      label: info.label,
      get: (s: StrategyId) => {
        const c = result.plans[s].components[info.slot];
        if (!c) return "—";
        if (info.kind === "hotel") return `${result.hotels.find((h) => h.id === c.option.offerId)?.name} · ${c.option.label}`;
        return `${cabinLabel(c.option.cabin)} · ${c.option.label}`;
      },
    })),
    { label: "Confidence", get: (s) => `${result.plans[s].confidence.level} (${result.plans[s].confidence.score})` },
  ];
  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-elevated shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-4 font-medium text-fg-subtle">Side by side</th>
            {STRATEGIES.map((s) => (
              <th key={s} className="p-4 font-display text-base font-normal">{result.plans[s].title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border/60 last:border-0">
              <td className="p-4 text-fg-muted">{r.label}</td>
              {STRATEGIES.map((s) => (
                <td key={s} className="p-4 tabular">{r.get(s)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border p-4 text-xs text-fg-subtle">
        *Estimated retail value minus cash paid. Retail values are demo estimates, not guaranteed savings. †Cash + points valued at your baselines − counted guaranteed perks.{" "}
        Rules version {result.rulesVersion}; {rules.dataset.disclaimer}
      </p>
    </div>
  );
}
