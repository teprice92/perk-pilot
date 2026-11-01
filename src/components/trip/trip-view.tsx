"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bookmark, BookmarkCheck, CalendarRange, Download, FlaskConical, Pencil, Printer, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUSD } from "@/lib/calc/money";
import { useRules } from "@/lib/hooks/use-rules";
import type { StrategyId } from "@/lib/optimizer/types";
import { useApp, type SavedTrip } from "@/lib/store/app-store";
import { cn, formatDate } from "@/lib/utils";
import { DestinationArt } from "@/components/app/destination-art";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { BookingCard, ExperienceRow } from "./booking-card";
import { ItineraryBoard } from "./itinerary-board";
import { ExperiencesTab, FlightsTab, HotelsTab } from "./offers-tabs";
import { ComparisonTable, StrategyCompare } from "./strategy-compare";
import { Panel, TripSummary } from "./summary";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "flights", label: "Flights" },
  { id: "hotels", label: "Hotels" },
  { id: "experiences", label: "Experiences" },
  { id: "itinerary", label: "Itinerary" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function TripView({ trip, initialTab = "overview" }: { trip: SavedTrip; initialTab?: Tab }) {
  const rules = useRules();
  const router = useRouter();
  const household = useApp((s) => s.household);
  const updateTrip = useApp((s) => s.updateTrip);
  const deleteTrip = useApp((s) => s.deleteTrip);
  const selectStrategy = useApp((s) => s.selectStrategy);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pending, setPending] = useState<StrategyId | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(trip.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { result } = trip;
  const plan = result.plans[trip.selectedStrategy];
  const travelerName = (id: string) => household.travelers.find((t) => t.id === id)?.name ?? id;

  const onSelect = (s: StrategyId) => {
    if (s === trip.selectedStrategy) return;
    if (trip.itineraryEdited) setPending(s);
    else selectStrategy(trip.id, s, true);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(trip, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `perkpilot-${result.destination.id}-${result.request.departDate}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <DestinationArt destination={result.destination} className="h-64 md:h-80">
        <div className="mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-6 text-white sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">{result.destination.country} · {result.destination.region}</p>
          <h1 className="font-display text-4xl leading-tight md:text-6xl">{trip.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
            <span className="inline-flex items-center gap-1.5"><CalendarRange className="size-4" />{formatDate(result.request.departDate, { month: "short", day: "numeric" })} – {formatDate(result.request.returnDate, { month: "short", day: "numeric", year: "numeric" })} · {result.nights} nights</span>
            <span className="inline-flex items-center gap-1.5"><Users className="size-4" />{result.party} traveler{result.party === 1 ? "" : "s"} · from {result.request.origin}</span>
          </p>
        </div>
      </DestinationArt>

      <div className="sticky top-16 z-30 border-b border-border bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <nav className="scrollbar-none -mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label="Trip sections">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("relative shrink-0 px-3 py-3.5 text-sm font-medium transition", tab === t.id ? "text-fg" : "text-fg-muted hover:text-fg")}>
                {t.label}
                {tab === t.id && <motion.span layoutId="trip-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant={trip.saved ? "subtle" : "accent"} onClick={() => { updateTrip(trip.id, { saved: !trip.saved }); toast(trip.saved ? "Removed from saved trips" : "Trip saved", trip.saved ? undefined : "Available offline on this device."); }}>
              {trip.saved ? <BookmarkCheck /> : <Bookmark />}<span className="hidden sm:inline">{trip.saved ? "Saved" : "Save trip"}</span>
            </Button>
            <span className="hidden items-center gap-1 sm:flex">
              <Button size="icon" variant="ghost" onClick={() => setRenaming(true)} aria-label="Rename trip"><Pencil /></Button>
              <Button size="icon" variant="ghost" onClick={() => window.print()} aria-label="Print itinerary"><Printer /></Button>
              <Button size="icon" variant="ghost" onClick={exportJson} aria-label="Export trip as JSON"><Download /></Button>
              <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete trip"><Trash2 /></Button>
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex gap-1 sm:hidden">
          <Button size="sm" variant="outline" onClick={() => setRenaming(true)}><Pencil /> Rename</Button>
          <Button size="sm" variant="outline" onClick={exportJson}><Download /> Export</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
        </div>
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--warning)_7%,var(--bg-elevated))] px-4 py-3 text-xs text-fg-muted">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>{result.dataNotice}</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            {tab === "overview" && (
              <div className="space-y-8">
                <section>
                  <h2 className="font-display mb-3 text-2xl">Choose your strategy</h2>
                  <StrategyCompare result={result} selected={trip.selectedStrategy} onSelect={onSelect} rules={rules} />
                </section>
                <section>
                  <h2 className="font-display mb-3 text-2xl">Trip summary · {plan.title}</h2>
                  <TripSummary result={result} plan={plan} rules={rules} travelerName={travelerName} />
                </section>
                <section>
                  <div className="mb-3 flex items-end justify-between">
                    <h2 className="font-display text-2xl">Booking recommendations</h2>
                    <button onClick={() => setTab("itinerary")} className="text-sm font-medium text-accent hover:underline">View itinerary →</button>
                  </div>
                  <div className="space-y-3">
                    <BookingCard slot="outbound" component={plan.components.outbound} result={result} rules={rules} />
                    <BookingCard slot="return" component={plan.components.return} result={result} rules={rules} />
                    <BookingCard slot="hotel" component={plan.components.hotel} result={result} rules={rules} />
                  </div>
                  <div className="mt-4">
                    <Panel icon={<span>✦</span>} title={`Experiences · ${formatUSD(plan.experiences.reduce((a, e) => a + e.cashAfterCreditsCents, 0))} for ${result.party}`}>
                      <div className="grid gap-2 md:grid-cols-2">
                        {plan.experiences.map((pe) => <ExperienceRow key={pe.experience.id} pe={pe} rules={rules} />)}
                      </div>
                    </Panel>
                  </div>
                </section>
                <section>
                  <h2 className="font-display mb-3 text-2xl">Compare all three</h2>
                  <ComparisonTable result={result} rules={rules} />
                </section>
              </div>
            )}
            {tab === "flights" && <FlightsTab result={result} plan={plan} rules={rules} />}
            {tab === "hotels" && <HotelsTab result={result} plan={plan} rules={rules} />}
            {tab === "experiences" && <ExperiencesTab trip={trip} rules={rules} />}
            {tab === "itinerary" && <ItineraryBoard trip={trip} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <Dialog open={pending !== null} onClose={() => setPending(null)} title="Switch strategy?">
        <p className="text-sm text-fg-muted">You&apos;ve edited this itinerary. Switching to <strong className="text-fg">{pending ? result.plans[pending].title : ""}</strong> can rebuild the itinerary from the new plan, or keep your edits.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => { if (pending) selectStrategy(trip.id, pending, false); setPending(null); }}>Keep my itinerary</Button>
          <Button variant="primary" onClick={() => { if (pending) selectStrategy(trip.id, pending, true); setPending(null); }}>Rebuild itinerary</Button>
        </div>
      </Dialog>

      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename trip">
        <form onSubmit={(e) => { e.preventDefault(); updateTrip(trip.id, { name: name.trim() || trip.name }); setRenaming(false); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus aria-label="Trip name" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this trip?">
        <p className="text-sm text-fg-muted">This removes the trip and its itinerary from this device.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => { deleteTrip(trip.id); router.push("/trips"); toast("Trip deleted"); }}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function TripNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl">Trip not found</h1>
      <p className="mt-2 text-fg-muted">It may have been deleted, or it was created on another device.</p>
      <Link href="/" className="mt-6 inline-block"><Button>Plan a new trip</Button></Link>
    </div>
  );
}
