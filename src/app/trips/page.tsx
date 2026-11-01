"use client";

import { Bookmark, Luggage, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import { itineraryTotals } from "@/lib/itinerary";
import { useRules } from "@/lib/hooks/use-rules";
import { useApp } from "@/lib/store/app-store";
import { formatDate, todayISO } from "@/lib/utils";
import { DestinationArt } from "@/components/app/destination-art";
import { PageHeader } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";

export default function TripsPage() {
  const trips = useApp((s) => s.trips);
  const hydrated = useApp((s) => s.hydrated);
  const deleteTrip = useApp((s) => s.deleteTrip);
  const updateTrip = useApp((s) => s.updateTrip);
  const rules = useRules();
  const [filter, setFilter] = useState<"all" | "saved" | "upcoming" | "drafts">("all");
  const today = todayISO();
  const list = trips
    .filter((t) => filter === "all" || (filter === "saved" ? t.saved : filter === "drafts" ? !t.saved : t.result.request.departDate >= today))
    .sort((a, b) => a.result.request.departDate.localeCompare(b.result.request.departDate));

  return (
    <div>
      <PageHeader
        eyebrow="Saved trips"
        title="Your trips"
        description="Saved trips and their itineraries live on this device and stay available offline. Drafts from recent searches are kept too (the five most recent)."
        actions={<Link href="/"><Button variant="primary"><Plus /> Plan a trip</Button></Link>}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "saved", label: "Saved" }, { value: "upcoming", label: "Upcoming" }, { value: "drafts", label: "Drafts" }]} className="mb-5" />
        {!hydrated ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Luggage className="size-5" />} title="No trips yet" body="Search for a destination and PerkPilot will build three strategies for you. Save the ones you like." action={<Link href="/"><Button variant="accent">Plan your first trip</Button></Link>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => {
              const p = t.result.plans[t.selectedStrategy];
              const tot = itineraryTotals(t.itinerary);
              const daysAway = Math.round((Date.parse(t.result.request.departDate) - Date.parse(today)) / 86_400_000);
              return (
                <article key={t.id} className="group overflow-hidden rounded-3xl border border-border bg-elevated shadow-card transition hover:-translate-y-0.5 hover:shadow-float">
                  <Link href={`/trip?id=${t.id}`} className="block">
                    <DestinationArt destination={t.result.destination} className="h-40">
                      <div className="flex h-full flex-col justify-between p-4 text-white">
                        <div className="flex gap-1.5">
                          {t.saved ? <Badge className="bg-white/20 text-white backdrop-blur"><Bookmark /> Saved</Badge> : <Badge className="bg-black/30 text-white/90 backdrop-blur">Draft</Badge>}
                          {daysAway >= 0 && <Badge className="bg-white/20 text-white backdrop-blur">in {daysAway} days</Badge>}
                        </div>
                        <div>
                          <p className="font-display text-2xl leading-tight">{t.name}</p>
                          <p className="text-xs text-white/85">{formatDate(t.result.request.departDate)} – {formatDate(t.result.request.returnDate, { month: "short", day: "numeric", year: "numeric" })}</p>
                        </div>
                      </div>
                    </DestinationArt>
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-fg-subtle">{p.title}</p>
                        <p className="font-display text-2xl tabular">{formatUSD(p.totals.cashCents)} <span className="font-sans text-xs text-fg-subtle">cash</span></p>
                        <p className="text-xs text-fg-muted tabular">{Object.entries(p.totals.pointsByProgram).map(([k, v]) => `${formatPoints(v, true)} ${rules.programName(k)}`).join(" + ") || "No points"}</p>
                      </div>
                      <div className="text-right text-xs text-fg-subtle">
                        <p>{tot.booked} booked</p>
                        <p>{tot.toBook} to book</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link href={`/trip?id=${t.id}&tab=itinerary`} className="flex-1"><Button variant="outline" size="sm" className="w-full">Itinerary</Button></Link>
                      <Button variant="ghost" size="sm" onClick={() => updateTrip(t.id, { saved: !t.saved })}>{t.saved ? "Unsave" : "Save"}</Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteTrip(t.id)} aria-label={`Delete ${t.name}`}><Trash2 /></Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
