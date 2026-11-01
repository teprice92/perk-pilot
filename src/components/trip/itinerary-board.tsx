"use client";

import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CircleCheck, CircleDashed, Clock, Footprints, GripVertical, Hotel, Lock, MapPinned, Plane, Sparkles, Ticket, Trash2, Wand2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { formatUSD } from "@/lib/calc/money";
import { itineraryTotals, type BookingStatus, type ItineraryItem } from "@/lib/itinerary";
import type { SavedTrip } from "@/lib/store/app-store";
import { useApp } from "@/lib/store/app-store";
import { cn, formatDate, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { DAY_COLORS } from "./helpers";

const TripMap = dynamic(() => import("./trip-map").then((m) => m.TripMap), { ssr: false, loading: () => <Skeleton className="h-full min-h-72 w-full" /> });


const STATUS: Record<BookingStatus, { label: string; next: BookingStatus; icon: React.ReactNode; cls: string }> = {
  idea: { label: "Idea", next: "to_book", icon: <CircleDashed />, cls: "text-fg-subtle" },
  to_book: { label: "To book", next: "booked", icon: <Clock />, cls: "text-warning" },
  booked: { label: "Booked", next: "idea", icon: <CircleCheck />, cls: "text-success" },
};

function ItemCard({ item, tripId, days, color }: { item: ItineraryItem; tripId: string; days: string[]; color: string }) {
  const setStatus = useApp((s) => s.setItemStatus);
  const remove = useApp((s) => s.removeItineraryItem);
  const move = useApp((s) => s.moveItineraryItem);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: item.anchored });
  const st = STATUS[item.status];
  const icon = item.kind === "flight" ? <Plane /> : item.kind === "hotel" ? <Hotel /> : <Ticket />;
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("group relative rounded-2xl border border-border bg-elevated p-3 shadow-card transition-shadow", isDragging && "z-50 shadow-float ring-2 ring-accent")}
    >
      {item.travelMinFromPrev ? (
        <p className="-mt-1 mb-2 flex items-center gap-1 text-[11px] text-fg-subtle"><Footprints className="size-3" /> {formatDuration(item.travelMinFromPrev)} travel</p>
      ) : null}
      <div className="flex items-start gap-2">
        {item.anchored ? (
          <span className="mt-0.5 text-fg-subtle" title="Anchored — flights and hotel check-in/out stay in place"><Lock className="size-3.5" /></span>
        ) : (
          <button {...listeners} {...attributes} className="mt-0.5 cursor-grab touch-none text-fg-subtle hover:text-fg active:cursor-grabbing" aria-label={`Drag ${item.title} to another day`}>
            <GripVertical className="size-4" />
          </button>
        )}
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg text-white [&_svg]:size-3.5" style={{ background: item.kind === "experience" ? color : "var(--navy-700)" }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tabular text-fg-subtle">{item.startTime ?? ""}{item.durationMin ? ` · ${formatDuration(item.durationMin)}` : ""}</p>
          <p className="text-sm font-medium leading-snug">{item.title}</p>
          {item.subtitle && <p className="text-xs text-fg-muted">{item.subtitle}</p>}
          {item.cardTip && <p className="mt-1 text-[11px] text-accent">{item.cardTip}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setStatus(tripId, item.id, st.next)} className={cn("inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium [&_svg]:size-3", st.cls)} aria-label={`Status: ${st.label}. Click to change.`}>
              {st.icon}{st.label}
            </button>
            {item.costCents > 0 && <span className="text-[11px] tabular text-fg-muted">{formatUSD(item.costCents)}</span>}
            {!item.anchored && (
              <>
                <Select aria-label="Move to day" value="" onChange={(e) => e.target.value && move(tripId, item.id, e.target.value)} className="ml-auto h-6 w-auto rounded-full py-0 pl-2 pr-6 text-[11px]">
                  <option value="">Move…</option>
                  {days.map((d, i) => <option key={d} value={d}>Day {i + 1}</option>)}
                </Select>
                <button onClick={() => remove(tripId, item.id)} className="text-fg-subtle opacity-60 hover:text-danger group-hover:opacity-100" aria-label={`Remove ${item.title}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({ date, index, children, minutes }: { date: string; index: number; children: React.ReactNode; minutes: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <section ref={setNodeRef} className={cn("flex w-full shrink-0 flex-col rounded-3xl border bg-muted/50 p-3 transition-colors md:w-80", isOver ? "border-accent bg-accent-soft/60" : "border-border")} aria-label={`Day ${index + 1}`}>
      <header className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: DAY_COLORS[index % DAY_COLORS.length] }}>Day {index + 1}</p>
          <p className="font-display text-lg">{formatDate(date, { weekday: "long", month: "short", day: "numeric" })}</p>
        </div>
        <span className={cn("text-xs tabular", minutes > 660 ? "text-warning" : "text-fg-subtle")}>{minutes ? `${Math.round(minutes / 60)}h planned` : "Free day"}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

export function ItineraryBoard({ trip }: { trip: SavedTrip }) {
  const move = useApp((s) => s.moveItineraryItem);
  const reoptimize = useApp((s) => s.reoptimize);
  const selectStrategy = useApp((s) => s.selectStrategy);
  const [mapDay, setMapDay] = useState<string>("all");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const { itinerary } = trip;
  const days = itinerary.days.map((d) => d.date);
  const totals = itineraryTotals(itinerary);

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && typeof e.over.id === "string") move(trip.id, String(e.active.id), e.over.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            const changes = reoptimize(trip.id);
            toast("Itinerary re-optimized", changes.length ? changes.slice(0, 3).join(" · ") : "Already efficient — no changes needed.", changes.some((c) => c.includes("very full")) ? "warning" : "success");
          }}
        >
          <Wand2 /> Re-optimize routes & timing
        </Button>
        <Link href={`/concierge?trip=${trip.id}&q=${encodeURIComponent("Review our itinerary and suggest improvements")}`}>
          <Button variant="outline" size="sm"><Sparkles /> Ask AI to review</Button>
        </Link>
        {trip.itineraryEdited && (
          <Button variant="ghost" size="sm" onClick={() => { selectStrategy(trip.id, trip.selectedStrategy, true); toast("Itinerary reset", "Rebuilt from your selected strategy."); }}>
            Reset to plan
          </Button>
        )}
        <span className="ml-auto text-xs text-fg-subtle tabular">{formatUSD(totals.costCents)} planned · {totals.booked} booked · {totals.toBook} to book</span>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="scrollbar-none -mx-4 flex flex-col gap-3 px-4 md:flex-row md:overflow-x-auto md:pb-2">
          {itinerary.days.map((d, i) => (
            <DayColumn key={d.date} date={d.date} index={i} minutes={d.items.filter((x) => !x.anchored).reduce((a, x) => a + x.durationMin + (x.travelMinFromPrev ?? 0), 0)}>
              {d.items.map((it) => <ItemCard key={it.id} item={it} tripId={trip.id} days={days} color={DAY_COLORS[i % DAY_COLORS.length]!} />)}
              {d.items.length === 0 && <p className="px-2 py-6 text-center text-xs text-fg-subtle">Drop activities here</p>}
            </DayColumn>
          ))}
        </div>
      </DndContext>

      <section className="rounded-3xl border border-border bg-elevated p-3 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPinned className="size-4 text-[color:var(--gold)]" /> Trip map</h3>
          <Select aria-label="Show day on map" value={mapDay} onChange={(e) => setMapDay(e.target.value)} className="h-8 w-auto rounded-full py-0 text-xs">
            <option value="all">All days</option>
            {itinerary.days.map((d, i) => <option key={d.date} value={d.date}>Day {i + 1}</option>)}
          </Select>
        </div>
        <div className="h-[380px] overflow-hidden rounded-2xl">
          <TripMap itinerary={itinerary} day={mapDay} />
        </div>
        <p className="px-2 pt-2 text-[11px] text-fg-subtle">Travel times are straight-line estimates (walking under 1.5 km, otherwise taxi/transit). <Badge variant="outline">Estimate</Badge></p>
      </section>
    </div>
  );
}
