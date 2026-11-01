"use client";

import { ArrowRightLeft, BadgeCheck, Gift, Lightbulb, Shield, Sparkles, TriangleAlert, Users } from "lucide-react";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import type { OptimizationResult, Plan } from "@/lib/optimizer/types";
import type { RulesRepository } from "@/lib/rules/repository";
import { formatDate } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";

export function TripSummary({ result, plan, rules, travelerName }: { result: OptimizationResult; plan: Plan; rules: RulesRepository; travelerName: (id: string) => string }) {
  const t = plan.totals;
  const amex = t.pointsByProgram["amex-mr"] ?? 0;
  const chase = t.pointsByProgram["chase-ur"] ?? 0;
  const other = Object.entries(t.pointsByProgram).filter(([k]) => k !== "amex-mr" && k !== "chase-ur");
  const tiles = [
    { label: "Estimated retail cost", value: formatUSD(t.retailCents), hint: "Demo estimate" },
    { label: "Cash out of pocket", value: formatUSD(t.cashCents), hint: t.creditsCents ? `after ${formatUSD(t.creditsCents)} in credits` : "after card credits" },
    { label: "Amex MR required", value: formatPoints(amex), hint: amex ? "Membership Rewards" : "Not used" },
    { label: "Chase UR required", value: formatPoints(chase), hint: chase ? "Ultimate Rewards" : "Not used" },
    { label: "Estimated cash savings", value: formatUSD(t.estimatedSavingsCents), hint: "vs. paying retail — not guaranteed" },
    { label: "Benefits unlocked", value: String(plan.benefits.filter((b) => b.kind !== "access").length), hint: t.perksValueCents ? `${formatUSD(t.perksValueCents)} guaranteed perks` : "credits, perks & protections" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-2xl border border-border bg-elevated p-4 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{x.label}</p>
            <p className="font-display mt-1.5 text-2xl tabular sm:text-3xl">{x.value}</p>
            <p className="mt-0.5 text-xs text-fg-subtle">{x.hint}</p>
          </div>
        ))}
      </div>
      {other.length > 0 && (
        <p className="text-xs text-fg-muted">Also uses: {other.map(([k, v]) => `${formatPoints(v)} ${rules.programName(k)}`).join(", ")} from balances you already hold.</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel icon={<Lightbulb />} title="Why this plan">
          <ul className="space-y-2.5 text-sm">
            {plan.rationale.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{r}</li>
            ))}
          </ul>
          <div className="mt-4"><ConfidenceBadge confidence={plan.confidence} /></div>
          <ul className="mt-2 space-y-0.5 text-xs text-fg-subtle">
            {plan.confidence.reasons.map((r) => <li key={r}>· {r}</li>)}
          </ul>
        </Panel>

        <Panel icon={<Users />} title="Points after booking">
          {plan.balances.length === 0 ? (
            <p className="text-sm text-fg-muted">This plan doesn&apos;t use any points — your balances stay intact.</p>
          ) : (
            <ul className="divide-y divide-border">
              {plan.balances.map((b) => (
                <li key={`${b.programId}-${b.travelerId}`} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{rules.programName(b.programId)}</span>
                    <span className="text-fg-subtle"> · {travelerName(b.travelerId)}</span>
                  </span>
                  <span className="tabular">
                    <span className="text-fg-subtle line-through decoration-1">{formatPoints(b.before)}</span>
                    <span className="ml-2 font-semibold">{formatPoints(b.after)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {plan.householdSteps.length > 0 && (
            <div className="mt-3 rounded-xl bg-accent-soft p-3 text-xs text-accent">
              {plan.householdSteps.map((s) => <p key={s}>{s}</p>)}
            </div>
          )}
        </Panel>
      </div>

      {plan.transfers.length > 0 && (
        <Panel icon={<ArrowRightLeft />} title="Point transfers required" tone="gold">
          <p className="mb-3 text-sm text-fg-muted">
            Transfers are <strong className="text-fg">irreversible</strong>. Confirm award seats or rooms are bookable on the partner site <em>before</em> transferring. PerkPilot never moves points for you.
          </p>
          <ol className="space-y-2">
            {plan.transfers.map((x, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-xl border border-border bg-elevated p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="font-medium">{i + 1}. {formatPoints(x.sourcePoints)} {rules.programName(x.fromProgram)} → {formatPoints(x.partnerPointsReceived)} {rules.programName(x.toProgram)}</span>
                  <span className="block text-xs text-fg-subtle">{x.recipientNote} For the {x.forSlot === "hotel" ? "hotel" : `${x.forSlot} flight`}.</span>
                </span>
                <span className="flex shrink-0 flex-wrap gap-1.5">
                  <Badge variant="outline">Ratio {x.ratioText}</Badge>
                  {x.bonusPercent > 0 && <Badge variant="gold"><Sparkles />+{x.bonusPercent}% bonus</Badge>}
                  <Badge>{x.transferTime}</Badge>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel icon={<Gift />} title="Benefits unlocked">
        <div className="grid gap-2 sm:grid-cols-2">
          {plan.benefits.map((b, i) => (
            <div key={`${b.benefitId}-${i}`} className="flex items-start gap-3 rounded-xl border border-border p-3">
              <span className="mt-0.5 text-accent [&_svg]:size-4">{b.kind === "protection" ? <Shield /> : b.kind === "credit" ? <BadgeCheck /> : <Sparkles />}</span>
              <span className="min-w-0 text-sm">
                <span className="font-medium">{b.name}</span>
                {b.valueCents ? <span className="ml-1.5 tabular text-success">{formatUSD(b.valueCents)}</span> : null}
                <span className="block text-xs text-fg-subtle">{b.note}</span>
              </span>
            </div>
          ))}
        </div>
      </Panel>

      {plan.warnings.length > 0 && (
        <Panel icon={<TriangleAlert />} title="Before you book" tone="warning">
          <ul className="space-y-1 text-sm text-fg-muted">
            {plan.warnings.map((w) => <li key={w}>· {w}</li>)}
          </ul>
        </Panel>
      )}

      {result.dateInsights.length > 0 && <DateInsights result={result} />}
    </div>
  );
}

function DateInsights({ result }: { result: OptimizationResult }) {
  const out = result.dateInsights.filter((d) => d.direction === "outbound");
  const ret = result.dateInsights.filter((d) => d.direction === "return");
  const best = [...result.dateInsights].sort((a, b) => a.deltaVsSelectedCents - b.deltaVsSelectedCents)[0];
  const Row = ({ list, label }: { list: typeof out; label: string }) => (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
      <div className="flex flex-wrap gap-2">
        {list.map((d) => (
          <span key={d.date} className={`rounded-xl border px-3 py-2 text-xs tabular ${d.deltaVsSelectedCents < 0 ? "border-[color-mix(in_oklab,var(--success)_40%,transparent)] text-success" : "border-border text-fg-muted"}`}>
            {formatDate(d.date, { weekday: "short", month: "short", day: "numeric" })}
            <span className="block font-semibold">{d.deltaVsSelectedCents > 0 ? "+" : ""}{formatUSD(d.deltaVsSelectedCents)}/pp</span>
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <Panel icon={<Lightbulb />} title="Flexible dates">
      {best && best.deltaVsSelectedCents < 0 ? (
        <p className="mb-3 text-sm">Shifting your {best.direction} to <strong>{formatDate(best.date, { weekday: "long", month: "short", day: "numeric" })}</strong> could save about <strong>{formatUSD(-best.deltaVsSelectedCents)}</strong> per person on the lowest economy fare (demo estimate).</p>
      ) : (
        <p className="mb-3 text-sm text-fg-muted">Your selected dates are already the cheapest in the window for economy cash fares.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Row list={out} label="Outbound" />
        <Row list={ret} label="Return" />
      </div>
    </Panel>
  );
}

export function Panel({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "gold" | "warning" }) {
  return (
    <section className={`rounded-3xl border p-5 shadow-card ${tone === "gold" ? "border-[color-mix(in_oklab,var(--gold)_40%,transparent)] bg-gold-soft/50" : tone === "warning" ? "border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_6%,var(--bg-elevated))]" : "border-border bg-elevated"}`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-[color:var(--gold)]">{icon}{title}</h3>
      {children}
    </section>
  );
}
