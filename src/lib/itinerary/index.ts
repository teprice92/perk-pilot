import type { ExperienceOffer, FlightOffer, HotelOffer } from "@/lib/domain/types";
import type { OptimizationResult, StrategyId } from "@/lib/optimizer/types";
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
  bestTime?: ExperienceOffer["bestTime"];
  travelMinFromPrev?: number;
}

export interface ItineraryDay {
  date: string;
  items: ItineraryItem[];
}

export interface Itinerary {
  strategy: StrategyId;
  days: ItineraryDay[];
  hotel: { name: string; lat: number; lng: number };
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

function flightItem(f: FlightOffer, label: string, cost: number): ItineraryItem {
  return {
    id: `flight-${f.direction}`,
    kind: "flight",
    title: `${label}: ${f.carrierName} ${f.flightNumbers.join(" / ")}`,
    subtitle: `${f.origin} ${f.departTime} → ${f.destination} ${f.arriveTime}${f.arrivesNextDay ? " (+1)" : ""} · ${f.cabin.replace("_", " ")}${f.stops ? ` · via ${f.via}` : " · nonstop"}`,
    startTime: f.departTime,
    durationMin: f.durationMin,
    costCents: cost,
    status: "to_book",
    refId: f.id,
    anchored: true,
  };
}

/** Recompute start times and travel legs within a day. */
export function recomputeDay(day: ItineraryDay, hotel: Itinerary["hotel"]): ItineraryDay {
  let cursor: number | null = null;
  let prev: { lat: number; lng: number } = hotel;
  const items = day.items.map((it) => {
    const next = { ...it };
    if (it.anchored && it.startTime) {
      cursor = toMin(it.startTime) + it.durationMin;
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

export function buildItinerary(result: OptimizationResult, strategy: StrategyId): Itinerary {
  const plan = result.plans[strategy];
  const outOffer = result.flights.outbound.find((f) => f.id === plan.components.outbound.option.offerId)!;
  const retOffer = result.flights.return.find((f) => f.id === plan.components.return.option.offerId)!;
  const hotelOffer = result.hotels.find((h) => h.id === plan.components.hotel.option.offerId) as HotelOffer;
  const hotel = { name: hotelOffer.name, lat: hotelOffer.lat, lng: hotelOffer.lng };
  const totalDays = result.nights + 1;
  const days: ItineraryDay[] = Array.from({ length: totalDays }, (_, i) => ({ date: addDays(result.request.departDate, i), items: [] }));

  // Arrival
  days[0]!.items.push(flightItem(outOffer, "Depart", plan.components.outbound.cashAfterCreditsCents));
  const arrivalDay = outOffer.arrivesNextDay && totalDays > 1 ? 1 : 0;
  days[arrivalDay]!.items.push({
    id: "checkin",
    kind: "hotel",
    title: `Check in · ${hotelOffer.name}`,
    subtitle: `${hotelOffer.neighborhood} · ${plan.components.hotel.option.label}`,
    startTime: toTime(toMin(outOffer.arriveTime) + 90),
    durationMin: 45,
    lat: hotel.lat,
    lng: hotel.lng,
    costCents: plan.components.hotel.cashAfterCreditsCents,
    status: "to_book",
    refId: hotelOffer.id,
    anchored: true,
  });

  // Departure
  const last = days[totalDays - 1]!;
  last.items.push({
    id: "checkout",
    kind: "hotel",
    title: `Check out · ${hotelOffer.name}`,
    startTime: toTime(Math.max(7 * 60, toMin(retOffer.departTime) - 210)),
    durationMin: 30,
    lat: hotel.lat,
    lng: hotel.lng,
    costCents: 0,
    status: "to_book",
    anchored: true,
  });
  last.items.push(flightItem(retOffer, "Return", plan.components.return.cashAfterCreditsCents));

  // Distribute experiences across full days (and arrival/departure if needed).
  const fullDays = days.map((_, i) => i).filter((i) => i > arrivalDay && i < totalDays - 1);
  const candidates = fullDays.length ? fullDays : [arrivalDay];
  const exps = [...plan.experiences].sort((a, b) => order(a.experience.bestTime) - order(b.experience.bestTime));
  exps.forEach((pe, idx) => {
    const dayIdx = candidates[idx % candidates.length]!;
    days[dayIdx]!.items.push(experienceItem(pe.experience, pe.cashAfterCreditsCents, pe.cardTip));
  });

  const itin: Itinerary = { strategy, days, hotel, generatedAt: new Date().toISOString() };
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

/**
 * Deterministic re-optimisation after user edits:
 *  1. keeps anchored items fixed,
 *  2. orders flexible items by time-of-day preference, then nearest-neighbour
 *     from the hotel to minimise travel,
 *  3. recomputes start times and flags overloaded days.
 */
export function reoptimizeItinerary(itin: Itinerary): { itinerary: Itinerary; changes: string[] } {
  const changes: string[] = [];
  const days = itin.days.map((day) => {
    const anchoredFirst = day.items.filter((i) => i.anchored && i.kind === "flight" && i.id === "flight-outbound");
    const flexible = day.items.filter((i) => !i.anchored);
    const anchoredRest = day.items.filter((i) => i.anchored && !anchoredFirst.includes(i));
    const groups = ["morning", "any", "afternoon", "evening"].map((slot) => flexible.filter((i) => (i.bestTime ?? "any") === slot));
    const ordered: ItineraryItem[] = [];
    let pos = { lat: itin.hotel.lat, lng: itin.hotel.lng };
    for (const g of groups) {
      const pool = [...g];
      while (pool.length) {
        pool.sort((a, b) => dist(pos, a) - dist(pos, b));
        const nxt = pool.shift()!;
        ordered.push(nxt);
        if (nxt.lat !== undefined && nxt.lng !== undefined) pos = { lat: nxt.lat, lng: nxt.lng };
      }
    }
    const before = flexible.map((i) => i.id).join(",");
    const after = ordered.map((i) => i.id).join(",");
    if (before !== after && flexible.length > 1) changes.push(`Reordered ${day.date} to reduce travel time`);
    // Check-in goes first on arrival day; checkout/return flight stay last.
    const checkin = anchoredRest.filter((i) => i.id === "checkin");
    const tail = anchoredRest.filter((i) => i.id !== "checkin");
    const items = [...anchoredFirst, ...checkin, ...ordered, ...tail];
    const recomputed = recomputeDay({ ...day, items }, itin.hotel);
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
  const tailStart = items.findIndex((i) => i.id === "checkout");
  const insertAt = toIndex ?? (tailStart >= 0 ? tailStart : items.length);
  items.splice(Math.min(insertAt, tailStart >= 0 ? tailStart : items.length), 0, moved);
  days[target] = recomputeDay({ ...days[target]!, items }, itin.hotel);
  return { ...itin, days: days.map((d, i) => (i === target ? d : recomputeDay(d, itin.hotel))) };
}

export function itineraryTotals(itin: Itinerary) {
  const items = itin.days.flatMap((d) => d.items);
  return {
    costCents: items.reduce((a, i) => a + i.costCents, 0),
    toBook: items.filter((i) => i.status !== "booked" && i.costCents > 0).length,
    booked: items.filter((i) => i.status === "booked").length,
  };
}
