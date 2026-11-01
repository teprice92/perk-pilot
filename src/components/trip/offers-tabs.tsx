"use client";

import { Check, ExternalLink, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCpp, formatUSD } from "@/lib/calc/money";
import type { Cabin, ExperienceOffer } from "@/lib/domain/types";
import { experienceItem } from "@/lib/itinerary";
import type { OptimizationResult, PaymentOption, Plan } from "@/lib/optimizer/types";
import type { RulesRepository } from "@/lib/rules/repository";
import type { SavedTrip } from "@/lib/store/app-store";
import { useApp } from "@/lib/store/app-store";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { DataKindBadge } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cabinLabel, cardShort, methodLabel, pointsText } from "./helpers";

function OptionTable({ options, plan, rules }: { options: PaymentOption[]; plan: Plan; rules: RulesRepository }) {
  const chosen = new Set(Object.values(plan.components).map((c) => c.option.id));
  const sorted = [...options].sort((a, b) => a.cashCents - b.cashCents);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
            <th className="py-2 pr-3 font-medium">How to pay</th>
            <th className="py-2 pr-3 font-medium">Points</th>
            <th className="py-2 pr-3 font-medium">Cash</th>
            <th className="py-2 pr-3 font-medium">Value</th>
            <th className="py-2 font-medium">Card / perks</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.id} className={cn("border-t border-border/70", chosen.has(o.id) && "bg-accent-soft/60")}>
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-1.5 font-medium">
                  {chosen.has(o.id) && <Check className="size-3.5 text-accent" aria-label="In selected plan" />}
                  {o.label}
                </span>
                <span className="text-xs text-fg-subtle">{methodLabel[o.method]}</span>
              </td>
              <td className="py-2.5 pr-3 tabular">{pointsText(rules, o)}</td>
              <td className="py-2.5 pr-3 tabular">{formatUSD(o.cashCents)}</td>
              <td className={cn("py-2.5 pr-3 tabular", o.cpp !== null && o.cpp >= 1.5 ? "text-success" : "")}>{o.cpp !== null ? `${formatCpp(o.cpp)}/pt` : "—"}</td>
              <td className="py-2.5 text-xs text-fg-muted">
                {o.payWithCardId ? cardShort(rules, o.payWithCardId) : o.bankProgramId ? rules.programName(o.bankProgramId) : ""}
                {o.perksValueCents ? ` · perks ~${formatUSD(o.perksValueCents)}` : ""}
                {o.transfer?.bonusPercent ? ` · +${o.transfer.bonusPercent}% bonus` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FlightsTab({ result, plan, rules }: { result: OptimizationResult; plan: Plan; rules: RulesRepository }) {
  const [dir, setDir] = useState<"outbound" | "return">("outbound");
  const [cabin, setCabin] = useState<Cabin | "all">("all");
  const [limit, setLimit] = useState(8);
  const offers = dir === "outbound" ? result.flights.outbound : result.flights.return;
  const opts = result.options[dir];
  const chosenOffer = plan.components[dir].option.offerId;
  const list = useMemo(() => {
    const filtered = offers.filter((f) => cabin === "all" || f.cabin === cabin);
    const best = (id: string) => Math.min(...opts.filter((o) => o.offerId === id).map((o) => o.cashCents));
    return filtered.sort((a, b) => (a.id === chosenOffer ? -1 : b.id === chosenOffer ? 1 : best(a.id) - best(b.id)));
  }, [offers, cabin, opts, chosenOffer]);
  const cabins = [...new Set(offers.map((f) => f.cabin))];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={dir} onChange={(v) => { setDir(v); setLimit(8); }} options={[{ value: "outbound", label: "Outbound" }, { value: "return", label: "Return" }]} />
        <Segmented size="sm" value={cabin} onChange={setCabin} options={[{ value: "all", label: "All cabins" }, ...cabins.map((c) => ({ value: c, label: cabinLabel(c) }))]} />
        <span className="text-xs text-fg-subtle">{list.length} itineraries · airports {[...new Set(offers.map((o) => (dir === "outbound" ? o.destination : o.origin)))].join(", ")}</span>
      </div>
      {list.slice(0, limit).map((f) => (
        <article key={f.id} className={cn("rounded-3xl border bg-elevated p-5 shadow-card", f.id === chosenOffer ? "border-accent" : "border-border")}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h4 className="font-semibold">{f.carrierName} · {cabinLabel(f.cabin)}</h4>
                {f.id === chosenOffer && <Badge variant="accent">In your plan</Badge>}
                <DataKindBadge kind={f.dataKind} />
                {f.refundable && <Badge variant="outline">Refundable fare</Badge>}
              </div>
              <p className="text-sm text-fg-muted tabular">
                {formatDate(f.date, { weekday: "short", month: "short", day: "numeric" })} · {f.origin} {f.departTime} → {f.destination} {f.arriveTime}{f.arrivesNextDay ? " (+1)" : ""} · {formatDuration(f.durationMin)} · {f.stops ? `via ${f.via}` : "nonstop"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-xl tabular">{formatUSD(f.cashPerPersonCents)}<span className="text-xs text-fg-subtle"> /person</span></p>
              <a href={f.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Verify fare <ExternalLink className="size-3" /></a>
            </div>
          </div>
          <OptionTable options={opts.filter((o) => o.offerId === f.id)} plan={plan} rules={rules} />
        </article>
      ))}
      {list.length > limit && <Button variant="outline" onClick={() => setLimit((l) => l + 8)} className="w-full">Show more flights</Button>}
      <p className="text-xs text-fg-subtle">Award prices are estimates; availability is never confirmed without a live inventory source. Prices shown per direction are the per-person share of a round-trip fare.</p>
    </div>
  );
}

export function HotelsTab({ result, plan, rules }: { result: OptimizationResult; plan: Plan; rules: RulesRepository }) {
  const chosen = plan.components.hotel.option.offerId;
  const hotels = [...result.hotels].sort((a, b) => (a.id === chosen ? -1 : b.id === chosen ? 1 : b.stars - a.stars || b.nightlyCashCents - a.nightlyCashCents));
  const programLabel = { amex_fhr: "Amex FHR", amex_thc: "Amex THC", chase_edit: "Chase The Edit" } as const;
  return (
    <div className="space-y-4">
      {hotels.map((h) => (
        <article key={h.id} className={cn("overflow-hidden rounded-3xl border bg-elevated shadow-card", h.id === chosen ? "border-accent" : "border-border")}>
          <div className="grid md:grid-cols-[220px_1fr]">
            <div className="relative min-h-36" style={{ background: `linear-gradient(140deg, hsl(${h.hue} 35% 30%), hsl(${(h.hue + 40) % 360} 40% 62%))` }}>
              <div className="absolute inset-0 grid place-items-center font-display text-5xl text-white/25">{h.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
                {h.programs.map((p) => <span key={p} className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">{programLabel[p]}</span>)}
              </div>
            </div>
            <div className="p-5">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h4 className="text-lg font-semibold">{h.name}</h4>
                    {h.id === chosen && <Badge variant="accent">In your plan</Badge>}
                    <DataKindBadge kind={h.dataKind} />
                  </div>
                  <p className="text-sm text-fg-muted">{h.neighborhood} · {"★".repeat(h.stars)} · {h.tier} · rated {h.rating.toFixed(1)}</p>
                  <p className="mt-1 text-sm text-fg-muted">{h.description}</p>
                  <p className="mt-1 text-xs text-fg-subtle">{h.amenities.join(" · ")} · {h.cancellationPolicy}{h.resortFeePerNightCents ? ` · resort fee ${formatUSD(h.resortFeePerNightCents)}/night` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl tabular">{formatUSD(h.nightlyCashCents)}<span className="text-xs text-fg-subtle"> /night</span></p>
                  {h.award && <p className="text-xs text-fg-muted tabular">{h.award.pointsPerNight.toLocaleString()} {rules.programName(h.award.programId)} /night (est.)</p>}
                </div>
              </div>
              <OptionTable options={result.options.hotel.filter((o) => o.offerId === h.id)} plan={plan} rules={rules} />
              {h.award && !result.options.hotel.some((o) => o.offerId === h.id && o.loyaltyProgramId === h.award!.programId) && (
                <p className="mt-2 text-xs text-fg-subtle">
                  Award stay needs about {(h.award.pointsPerNight * result.nights * result.rooms).toLocaleString()} {rules.programName(h.award.programId)} points — more than your household can access in that program or through eligible transfers.
                </p>
              )}
            </div>
          </div>
        </article>
      ))}
      <p className="text-xs text-fg-subtle">Guaranteed perks (e.g. daily breakfast, property credits) are valued only when guaranteed and not already included in the rate. Upgrades and early check-in are shown but never counted.</p>
    </div>
  );
}

const CATS: Array<{ id: ExperienceOffer["category"] | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "food", label: "Food" },
  { id: "dining", label: "Dining" },
  { id: "culture", label: "Culture" },
  { id: "museum", label: "Museums" },
  { id: "adventure", label: "Adventure" },
  { id: "nature", label: "Nature" },
  { id: "wellness", label: "Wellness" },
  { id: "event", label: "Events" },
  { id: "nightlife", label: "Nightlife" },
];

export function ExperiencesTab({ trip, rules }: { trip: SavedTrip; rules: RulesRepository }) {
  const setItinerary = useApp((s) => s.setItinerary);
  const household = useApp((s) => s.household);
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("all");
  const [dayFor, setDayFor] = useState<Record<string, string>>({});
  const { result, itinerary } = trip;
  const inItin = new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.refId)));
  const owned = new Set(household.travelers.flatMap((t) => t.cards.map((c) => c.cardId)));
  const list = result.experiences.filter((e) => cat === "all" || e.category === cat);
  const cardAngle = (e: ExperienceOffer) => {
    const matches = rules.benefits().filter((b) => b.amountCents && b.eligibleTags?.some((t) => e.tags.includes(t)) && owned.has(b.cardId));
    return matches.map((b) => `${b.name} (${cardShort(rules, b.cardId)})${b.enrollmentRequired ? " — enrollment required" : ""}`);
  };
  const add = (e: ExperienceOffer) => {
    const date = dayFor[e.id] ?? itinerary.days[Math.min(1, itinerary.days.length - 1)]!.date;
    const days = itinerary.days.map((d) => {
      if (d.date !== date) return d;
      const tail = d.items.findIndex((i) => i.id === "checkout");
      const items = [...d.items];
      items.splice(tail >= 0 ? tail : items.length, 0, experienceItem(e, e.pricePerPersonCents * result.party, null));
      return { ...d, items };
    });
    setItinerary(trip.id, { ...itinerary, days });
    toast("Added to itinerary", `${e.name} on ${formatDate(date, { weekday: "short", month: "short", day: "numeric" })}`);
  };
  return (
    <div className="space-y-4">
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {CATS.filter((c) => c.id === "all" || result.experiences.some((e) => e.category === c.id)).map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition", cat === c.id ? "border-fg bg-fg text-bg" : "border-border text-fg-muted hover:border-border-strong")}>{c.label}</button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((e) => {
          const angles = cardAngle(e);
          return (
            <article key={e.id} className="flex flex-col rounded-3xl border border-border bg-elevated p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{e.category.replace("_", " ")}</Badge>
                    {e.premium && <Badge variant="gold">Premium</Badge>}
                    {inItin.has(e.id) && <Badge variant="accent">In itinerary</Badge>}
                  </div>
                  <h4 className="mt-2 font-semibold">{e.name}</h4>
                  <p className="text-xs text-fg-subtle">{e.neighborhood} · {formatDuration(e.durationMin)} · best {e.bestTime} · ★ {e.rating}</p>
                </div>
                <p className="font-display shrink-0 text-xl tabular">{e.pricePerPersonCents ? formatUSD(e.pricePerPersonCents) : "Free"}<span className="block text-right text-[11px] font-sans text-fg-subtle">{e.pricePerPersonCents ? "per person" : ""}</span></p>
              </div>
              <p className="mt-2 flex-1 text-sm text-fg-muted">{e.description}</p>
              <div className="mt-3 rounded-xl bg-muted/70 p-3 text-xs">
                {angles.length ? (
                  <p className="text-accent">Possible card benefit: {angles.join("; ")}. Applies only if the venue/ticket platform qualifies.</p>
                ) : (
                  <p className="text-fg-subtle">No card benefit assumed. Owning a premium card doesn&apos;t make this cheaper.</p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select aria-label={`Day for ${e.name}`} value={dayFor[e.id] ?? itinerary.days[Math.min(1, itinerary.days.length - 1)]!.date} onChange={(ev) => setDayFor({ ...dayFor, [e.id]: ev.target.value })} className="h-8 w-auto rounded-full py-0 text-xs">
                  {itinerary.days.map((d, i) => <option key={d.date} value={d.date}>Day {i + 1} · {formatDate(d.date, { weekday: "short", month: "short", day: "numeric" })}</option>)}
                </Select>
                <Button size="sm" variant="outline" onClick={() => add(e)}><Plus /> Add</Button>
                <a href={e.bookingUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">Look up <ExternalLink className="size-3" /></a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
