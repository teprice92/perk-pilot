"use client";

import { ChevronDown, ExternalLink, Hotel, Plane, PlaneLanding, Ticket } from "lucide-react";
import { useState } from "react";
import { formatCpp, formatUSD } from "@/lib/calc/money";
import type { OptimizationResult, PlanComponent, PlannedExperience, SlotInfo } from "@/lib/optimizer/types";
import type { RulesRepository } from "@/lib/rules/repository";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { ConfidenceBadge, DataKindBadge } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";
import { cabinLabel, cardShort, methodLabel, pointsText } from "./helpers";

export function BookingCard({ info, component, result, rules }: { info: SlotInfo; component: PlanComponent; result: OptimizationResult; rules: RulesRepository }) {
  const [open, setOpen] = useState(false);
  const o = component.option;
  const slot = info.slot;
  const flight = info.kind === "flight" ? (result.flights[slot] ?? []).find((f) => f.id === o.offerId) : undefined;
  const hotel = info.kind === "hotel" ? result.hotels.find((h) => h.id === o.offerId) : undefined;
  const award = flight?.awards.find((a) => a.programId === o.loyaltyProgramId);
  const fetchedAt = flight?.fetchedAt ?? hotel?.fetchedAt;
  const kind = flight?.dataKind ?? hotel?.dataKind ?? "demo";
  const card = o.payWithCardId ?? o.earn?.cardId;

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-elevated shadow-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-fg-muted [&_svg]:size-5">
          {slot === "return" ? <PlaneLanding /> : info.kind === "flight" ? <Plane /> : <Hotel />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{info.kind === "hotel" ? `${info.label} · ${info.nights ?? result.nights} nights` : `${info.label} · ${flight ? formatDate(flight.date, { weekday: "short", month: "short", day: "numeric" }) : ""}`}</span>
            <Badge variant="accent">{methodLabel[o.method]}</Badge>
            <DataKindBadge kind={kind} />
            {award?.availability === "cached" && <Badge variant="accent" title={award.seenAt ? `Seen ${new Date(award.seenAt).toLocaleString()}` : undefined}>Award space seen · {award.source}</Badge>}
            {award?.availability === "confirmed" && <Badge variant="success">Award space confirmed</Badge>}
          </div>
          {flight && (
            <>
              <h4 className="mt-1.5 text-lg font-semibold">{flight.carrierName} · {cabinLabel(flight.cabin)}</h4>
              <p className="text-sm text-fg-muted tabular">
                {flight.origin} {flight.departTime} → {flight.destination} {flight.arriveTime}{flight.arrivesNextDay ? " (+1)" : ""} · {formatDuration(flight.durationMin)} · {flight.stops ? `1 stop via ${flight.via}` : "Nonstop"} · {flight.flightNumbers.join(" / ")}
              </p>
            </>
          )}
          {hotel && (
            <>
              <h4 className="mt-1.5 text-lg font-semibold">{hotel.name}</h4>
              <p className="text-sm text-fg-muted">{hotel.neighborhood} · {"★".repeat(hotel.stars)} · {hotel.description}</p>
            </>
          )}
          <p className="mt-2 text-sm"><span className="font-medium">{o.label}</span>{card && o.method !== "portal_points" && <span className="text-fg-muted"> · pay with {cardShort(rules, card)}</span>}</p>
        </div>
        <div className="flex shrink-0 flex-row gap-6 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
          <div>
            <p className="font-display text-2xl tabular">{formatUSD(component.cashAfterCreditsCents)}</p>
            <p className="text-xs text-fg-subtle">cash{component.credits.length ? ` after ${formatUSD(component.credits.reduce((a, c) => a + c.cents, 0))} credit` : ""}</p>
          </div>
          {o.draws.length > 0 && (
            <div>
              <p className="text-sm font-semibold tabular">{pointsText(rules, o)}</p>
              <p className="text-xs text-fg-subtle">{formatCpp(o.cpp)} per point · retail {formatUSD(o.retailCents)}</p>
            </div>
          )}
        </div>
      </div>

      {(o.perks.length > 0 || component.credits.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          {component.credits.map((c) => <Badge key={c.benefitId} variant="success">{c.name} −{formatUSD(c.cents)}</Badge>)}
          {o.perks.map((p) => (
            <Badge key={p.name} variant={p.kind === "guaranteed" ? "gold" : "outline"} title={p.kind === "guaranteed" ? "Guaranteed benefit" : "Subject to availability — not counted in value"}>
              {p.name}{p.counted ? ` · ~${formatUSD(p.valueCents)}` : p.kind === "when_available" ? " · if available" : ""}
            </Badge>
          ))}
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between border-t border-border px-5 py-3 text-sm font-medium text-fg-muted hover:bg-muted" aria-expanded={open}>
        Booking instructions
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border bg-muted/40 px-5 py-4 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5">
            {o.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          {o.warnings.length > 0 && <ul className="space-y-1 text-xs text-warning">{o.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a href={o.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 text-xs font-medium text-bg hover:opacity-90">
              Open booking site <ExternalLink className="size-3.5" />
            </a>
            {o.verifyUrl && o.verifyUrl !== o.bookingUrl && (
              <a href={o.verifyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium hover:bg-muted">
                Verify award space <ExternalLink className="size-3.5" />
              </a>
            )}
            <ConfidenceBadge confidence={o.confidence} />
          </div>
          <p className="text-xs text-fg-subtle">Source: {flight?.provider ?? hotel?.provider} · retrieved {fetchedAt ? new Date(fetchedAt).toLocaleString() : "—"} · rules {result.rulesVersion}</p>
        </div>
      )}
    </article>
  );
}

export function ExperienceRow({ pe, rules }: { pe: PlannedExperience; rules: RulesRepository }) {
  const e = pe.experience;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-elevated p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-fg-muted"><Ticket className="size-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-medium">{e.name}</p>
          {e.premium && <Badge variant="gold">Premium</Badge>}
        </div>
        <p className="text-xs text-fg-muted">{e.neighborhood} · {formatDuration(e.durationMin)} · ★ {e.rating}{e.attribution ? ` · ${e.attribution}` : ""}</p>
        {pe.cardTip && <p className="mt-1 text-xs text-accent">{pe.cardTip}</p>}
        {pe.payWithCardId && !pe.cardTip && <p className="mt-1 text-xs text-fg-subtle">Pay with {cardShort(rules, pe.payWithCardId)}</p>}
      </div>
      <div className="text-right">
        <p className="font-semibold tabular">{pe.totalCents ? formatUSD(pe.cashAfterCreditsCents) : "Free"}</p>
        {pe.credits.length > 0 && <p className="text-[11px] text-success">−{formatUSD(pe.credits.reduce((a, c) => a + c.cents, 0))} credit</p>}
      </div>
    </div>
  );
}
