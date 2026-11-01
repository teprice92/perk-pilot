import type { ExperienceOffer, FlightOffer, HotelOffer } from "@/lib/domain/types";
import type { OptimizationResult, SlotInfo, StrategyId } from "@/lib/optimizer/types";
import { haversineKm } from "@/lib/providers/demo/geo";

export type ItemKind = "flight" | "hotel" | "experience" | "transfer" | "free";
export type BookingStatus = "idea" | "to_book" | "booked";

export interface ItineraryItem {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle?: string;
  startTime?: string;
  durationMin: number;
  lat?: number;
  lng?: number;
  costCents: number;
  cardTip?: string | null;
  status: BookingStatus;
  refId?: string;
  /** Anchored items (flights, check-in/out) are not moved by re-optimization. */
  anchored?: boolean;
  /** Anchors that open the day (arrivals, check-ins, legs) vs close it (final checkout, return flight). */
  phase?: "start" | "end";
  bestTime?: ExperienceOffer["bestTime"];
  travelMinFromPrev?: number;
}

export interface ItineraryDay {
  date: string;
  items: ItineraryItem[];
}

export interface Stay {
  slot: string;
  name: string;
  lat: number;
  lng: number;
  /** Check-in date (inclusive). */
  startDate: string;
  /** Check-out date (exclusive for nights, inclusive for the day itself). */
  endDate: string;
  destinationId?: string;
}

export interface Itinerary {
  strategy: StrategyId;
  days: ItineraryDay[];
  /** First stay — kept for single-city convenience. */
  hotel: { name: string; lat: number; lng: number };
  /** All stays in order (multi-city trips have several). */
  stays?: Stay[];
  generatedAt: string;
  lastOptimizedAt?: string;
}

const SLOT_START: Record<string, number> = { morning: 9 * 60 + 30, afternoon: 14 * 60, evening: 19 * 60, any: 11 * 60 };

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const toTime = (min: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min / 5) * 5));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Door-to-door estimate: walk under 1.5 km, otherwise taxi/transit at city speeds. */
export function travelMinutes(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const km = haversineKm(aLat, aLng, bLat, bLng);
  if (km < 0.15) return 0;
  if (km < 1.5) return Math.round((km / 4.5) * 60);
  return Math.round((km / 22) * 60 + 10);
}

/** The stay whose hotel a given day is based from (the day you arrive counts for the new stay). */
export function stayForDate(itin: Itinerary, date: string): { name: string; lat: number; lng: number } {
  const stays = itin.stays;
  if (!stays?.length) return itin.hotel;
  return [...stays].reverse().find((s) => date >= s.startDate) ?? stays[0]!;
}

function flightItem(f: FlightOffer, slot: string, label: string, cost: number, phase: "start" | "end"): ItineraryItem {
  return {
    id: `flight-${slot}`,
    kind: "flight",
    title: `${label}: ${f.carrierName} ${f.flightNumbers.join(" / ")}`,
    subtitle: `${f.origin} ${f.departTime} → ${f.destination} ${f.arriveTime}${f.arrivesNextDay ? " (+1)" : ""} · ${f.cabin.replace("_", " ")}${f.stops ? ` · via ${f.via}` : " · nonstop"}`,
    startTime: f.departTime,
    durationMin: f.durationMin,
    costCents: cost,
    status: "to_book",
    refId: f.id,
    anchored: true,
    phase,
  };
}

/** Recompute start times and travel legs within a day. */
export function recomputeDay(day: ItineraryDay, hotel: { lat: number; lng: number }): ItineraryDay {
  let cursor: number | null = null;
  let prev: { lat: number; lng: number } = hotel;
  const items = day.items.map((it) => {
    const next = { ...it };
    if (it.anchored && it.startTime) {
      if (it.phase !== "end") cursor = Math.max(cursor ?? 0, toMin(it.startTime) + it.durationMin);
      if (it.lat !== undefined && it.lng !== undefined) prev = { lat: it.lat, lng: it.lng };
      next.travelMinFromPrev = undefined;
      return next;
    }
    const travel = it.lat !== undefined && it.lng !== undefined ? travelMinutes(prev.lat, prev.lng, it.lat, it.lng) : 0;
    const preferred = SLOT_START[it.bestTime ?? "any"]!;
    const earliest: number = cursor === null ? preferred : cursor + travel + 15;
    const start = Math.max(earliest, preferred);
    next.startTime = toTime(start);
    next.travelMinFromPrev = travel || undefined;
    cursor = start + it.durationMin;
    if (it.lat !== undefined && it.lng !== undefined) prev = { lat: it.lat, lng: it.lng };
    return next;
  });
  return { ...day, items };
}

function slotsOf(result: OptimizationResult): SlotInfo[] {
  if (result.slots?.length) return result.slots;
  return [
    { slot: "outbound", kind: "flight", label: "Outbound flight", date: result.request.departDate, destinationId: result.destination.id },
    { slot: "return", kind: "flight", label: "Return flight", date: result.request.returnDate, destinationId: result.destination.id },
    { slot: "hotel", kind: "hotel", label: "Hotel", date: result.request.departDate, destinationId: result.destination.id, checkIn: result.request.departDate, checkOut: result.request.returnDate, nights: result.nights },
  ];
}

export function buildItinerary(result: OptimizationResult, strategy: StrategyId): Itinerary {
  const plan = result.plans[strategy];
  const slots = slotsOf(result);
  const totalDays = result.nights + 1;
  const days: ItineraryDay[] = Array.from({ length: totalDays }, (_, i) => ({ date: addDays(result.request.departDate, i), items: [] }));
  const dayIndex = (date: string) => Math.max(0, Math.min(totalDays - 1, Math.round((Date.parse(date) - Date.parse(result.request.departDate)) / 86_400_000)));

  const offerFor = (slot: string) => (result.flights[slot] ?? []).find((f) => f.id === plan.components[slot]?.option.offerId);
  const stays: Stay[] = slots
    .filter((s) => s.kind === "hotel")
    .map((s) => {
      const h = result.hotels.find((x) => x.id === plan.components[s.slot]!.option.offerId) as HotelOffer;
      return { slot: s.slot, name: h.name, lat: h.lat, lng: h.lng, startDate: s.checkIn ?? result.request.departDate, endDate: s.checkOut ?? result.request.returnDate, destinationId: s.destinationId };
    });

  // Flights
  for (const s of slots.filter((x) => x.kind === "flight")) {
    const f = offerFor(s.slot);
    if (!f) continue;
    const label = s.slot === "outbound" ? "Depart" : s.slot === "return" ? "Return" : s.label;
    days[dayIndex(f.date)]!.items.push(flightItem(f, s.slot, label, plan.components[s.slot]!.cashAfterCreditsCents, s.slot === "return" ? "end" : "start"));
  }

  // Check-ins and check-outs (arrival times can roll past midnight).
  const arrivalDayOf: number[] = [];
  stays.forEach((stay, i) => {
    const inbound = i === 0 ? offerFor("outbound") : offerFor(`leg-${i}`);
    const hotelSlot = plan.components[stay.slot]!;
    let arrivalDay = inbound ? dayIndex(inbound.date) + (inbound.arrivesNextDay ? 1 : 0) : dayIndex(stay.startDate);
    let arriveAt = inbound ? toMin(inbound.arriveTime) + 90 : 15 * 60;
    if (arriveAt >= 24 * 60) {
      arriveAt -= 24 * 60;
      arrivalDay += 1;
    }
    arrivalDay = Math.min(arrivalDay, totalDays - 1);
    arrivalDayOf[i] = arrivalDay;
    const lateOrEarly = arriveAt < 13 * 60;
    days[arrivalDay]!.items.push({
      id: `checkin-${stay.slot}`,
      kind: "hotel",
      title: lateOrEarly && arriveAt >= 5 * 60 ? `Arrive & drop bags · ${stay.name}` : `Check in · ${stay.name}`,
      subtitle: lateOrEarly && arriveAt >= 5 * 60 ? `${hotelSlot.option.label} · rooms are usually ready mid-afternoon` : hotelSlot.option.label,
      startTime: toTime(arriveAt),
      durationMin: 45,
      lat: stay.lat,
      lng: stay.lng,
      costCents: hotelSlot.cashAfterCreditsCents,
      status: "to_book",
      refId: hotelSlot.option.offerId,
      anchored: true,
      phase: "start",
    });
    const outbound = i === stays.length - 1 ? offerFor("return") : offerFor(`leg-${i + 1}`);
    const isFinal = i === stays.length - 1;
    days[dayIndex(stay.endDate)]!.items.push({
      id: `checkout-${stay.slot}`,
      kind: "hotel",
      title: `Check out · ${stay.name}`,
      startTime: toTime(Math.max(7 * 60, (outbound ? toMin(outbound.departTime) : 12 * 60) - 210)),
      durationMin: 30,
      lat: stay.lat,
      lng: stay.lng,
      costCents: 0,
      status: "to_book",
      anchored: true,
      phase: isFinal ? "end" : "start",
    });
  });

  // Experiences: spread across the full days of the stay they belong to.
  stays.forEach((stay, si) => {
    // Activities start the day after arrival unless you land by early afternoon.
    const arrival = arrivalDayOf[si] ?? dayIndex(stay.startDate);
    const arrivalItem = days[arrival]!.items.find((x) => x.id === `checkin-${stay.slot}`);
    // Usable if you land in the morning/early afternoon, or after midnight (the rest of that day is free).
    const usableArrivalDay = arrivalItem?.startTime !== undefined && arrivalItem.startTime <= "14:00";
    const end = dayIndex(stay.endDate);
    let candidates = days.map((_, i) => i).filter((i) => (usableArrivalDay ? i >= arrival : i > arrival) && i < end);
    if (!candidates.length) candidates = [Math.min(arrival + 1, totalDays - 1)];
    const exps = plan.experiences
      .filter((pe) => stays.length === 1 || !pe.experience.destinationId || pe.experience.destinationId === stay.destinationId)
      .sort((a, b) => order(a.experience.bestTime) - order(b.experience.bestTime));
    exps.forEach((pe, idx) => {
      days[candidates[idx % candidates.length]!]!.items.push(experienceItem(pe.experience, pe.cashAfterCreditsCents, pe.cardTip));
    });
  });

  const first = stays[0]!;
  const itin: Itinerary = { strategy, days, hotel: { name: first.name, lat: first.lat, lng: first.lng }, stays, generatedAt: new Date().toISOString() };
  return reoptimizeItinerary(itin).itinerary;
}

function order(t: ExperienceOffer["bestTime"]): number {
  return { morning: 0, any: 1, afternoon: 2, evening: 3 }[t];
}

export function experienceItem(e: ExperienceOffer, cost: number, cardTip?: string | null): ItineraryItem {
  return {
    id: `exp-${e.id}`,
    kind: "experience",
    title: e.name,
    subtitle: `${e.neighborhood} · ${e.category.replace("_", " ")}`,
    durationMin: e.durationMin,
    lat: e.lat,
    lng: e.lng,
    costCents: cost,
    cardTip: cardTip ?? null,
    status: "idea",
    refId: e.id,
    bestTime: e.bestTime,
  };
}

/** Legacy items (pre multi-city) have no phase: infer it. */
function phaseOf(i: ItineraryItem): "start" | "end" {
  if (i.phase) return i.phase;
  return i.id === "checkout" || i.id === "flight-return" ? "end" : "start";
}

/**
 * Deterministic re-optimisation after user edits:
 *  1. keeps anchored items fixed (opening anchors first, closing anchors last),
 *  2. orders flexible items by time-of-day preference, then nearest-neighbour
 *     from that day's hotel to minimise travel,
 *  3. recomputes start times and flags overloaded days.
 */
export function reoptimizeItinerary(itin: Itinerary): { itinerary: Itinerary; changes: string[] } {
  const changes: string[] = [];
  const days = itin.days.map((day) => {
    const hotel = stayForDate(itin, day.date);
    const anchors = day.items.filter((i) => i.anchored).sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    const startAnchors = anchors.filter((i) => phaseOf(i) === "start");
    const endAnchors = anchors.filter((i) => phaseOf(i) === "end");
    const flexible = day.items.filter((i) => !i.anchored);
    const groups = ["morning", "any", "afternoon", "evening"].map((slot) => flexible.filter((i) => (i.bestTime ?? "any") === slot));
    const ordered: ItineraryItem[] = [];
    let pos = { lat: hotel.lat, lng: hotel.lng };
    for (const g of groups) {
      const pool = [...g];
      while (pool.length) {
        pool.sort((a, b) => dist(pos, a) - dist(pos, b));
        const nxt = pool.shift()!;
        ordered.push(nxt);
        if (nxt.lat !== undefined && nxt.lng !== undefined) pos = { lat: nxt.lat, lng: nxt.lng };
      }
    }
    if (flexible.map((i) => i.id).join() !== ordered.map((i) => i.id).join() && flexible.length > 1) changes.push(`Reordered ${day.date} to reduce travel time`);
    const recomputed = recomputeDay({ ...day, items: [...startAnchors, ...ordered, ...endAnchors] }, hotel);
    const busy = recomputed.items.filter((i) => !i.anchored).reduce((a, i) => a + i.durationMin + (i.travelMinFromPrev ?? 0), 0);
    if (busy > 11 * 60) changes.push(`${day.date} is very full (${Math.round(busy / 60)}h of activities) — consider moving something`);
    return recomputed;
  });
  return { itinerary: { ...itin, days, lastOptimizedAt: new Date().toISOString() }, changes };
}

function dist(a: { lat: number; lng: number }, b: ItineraryItem): number {
  return b.lat === undefined || b.lng === undefined ? 0 : haversineKm(a.lat, a.lng, b.lat, b.lng);
}

/** Move an item between days (used by drag-and-drop). */
export function moveItem(itin: Itinerary, itemId: string, toDate: string, toIndex?: number): Itinerary {
  let moved: ItineraryItem | undefined;
  const days = itin.days.map((d) => {
    const found = d.items.find((i) => i.id === itemId);
    if (found && !found.anchored) moved = found;
    return found && !found.anchored ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d;
  });
  if (!moved) return itin;
  const target = days.findIndex((d) => d.date === toDate);
  if (target < 0) return itin;
  const items = [...days[target]!.items];
  const tailStart = items.findIndex((i) => i.anchored && phaseOf(i) === "end");
  const limit = tailStart >= 0 ? tailStart : items.length;
  items.splice(Math.min(toIndex ?? limit, limit), 0, moved);
  return {
    ...itin,
    days: days.map((d, i) => recomputeDay(i === target ? { ...d, items } : d, stayForDate(itin, d.date))),
  };
}

/** Insert a new flexible item before the day's closing anchors. */
export function insertItem(itin: Itinerary, date: string, item: ItineraryItem): Itinerary {
  return {
    ...itin,
    days: itin.days.map((d) => {
      if (d.date !== date) return d;
      const items = [...d.items];
      const tail = items.findIndex((i) => i.anchored && phaseOf(i) === "end");
      items.splice(tail >= 0 ? tail : items.length, 0, item);
      return recomputeDay({ ...d, items }, stayForDate(itin, d.date));
    }),
  };
}

export function itineraryTotals(itin: Itinerary) {
  const items = itin.days.flatMap((d) => d.items);
  return {
    costCents: items.reduce((a, i) => a + i.costCents, 0),
    toBook: items.filter((i) => i.status !== "booked" && i.costCents > 0).length,
    booked: items.filter((i) => i.status === "booked").length,
  };
}
