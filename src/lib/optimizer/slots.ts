import type { TripRequest, TripStop } from "@/lib/domain/types";
import { daysBetween } from "@/lib/calc/periods";
import { destinationById } from "@/lib/providers/demo/catalog";
import type { SlotInfo } from "./types";

/** Booking slots for a trip — pure and browser-safe. */

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};


export function tripStops(request: TripRequest): TripStop[] {
  const total = Math.max(1, daysBetween(request.departDate, request.returnDate));
  if (request.stops && request.stops.length > 1) return request.stops;
  return [{ destinationId: request.destinationId, nights: total }];
}

export function buildSlots(request: TripRequest): SlotInfo[] {
  const stops = tripStops(request);
  const name = (id: string) => destinationById(id)?.name ?? id;
  const slots: SlotInfo[] = [];
  const multi = stops.length > 1;
  slots.push({ slot: "outbound", kind: "flight", label: multi ? `Outbound to ${name(stops[0]!.destinationId)}` : "Outbound flight", date: request.departDate, destinationId: stops[0]!.destinationId, toDestinationId: stops[0]!.destinationId });
  let cursor = request.departDate;
  const hotels: SlotInfo[] = [];
  stops.forEach((stop, i) => {
    const checkOut = i === stops.length - 1 ? request.returnDate : addDays(cursor, stop.nights);
    hotels.push({ slot: i === 0 ? "hotel" : `hotel-${i + 1}`, kind: "hotel", label: multi ? `Hotel in ${name(stop.destinationId)}` : "Hotel", date: cursor, destinationId: stop.destinationId, checkIn: cursor, checkOut, nights: daysBetween(cursor, checkOut) });
    if (i < stops.length - 1) {
      const next = stops[i + 1]!;
      slots.push({ slot: `leg-${i + 1}`, kind: "flight", label: `${name(stop.destinationId)} → ${name(next.destinationId)}`, date: checkOut, destinationId: next.destinationId, fromDestinationId: stop.destinationId, toDestinationId: next.destinationId });
    }
    cursor = checkOut;
  });
  const last = stops[stops.length - 1]!;
  slots.push({ slot: "return", kind: "flight", label: multi ? `Return from ${name(last.destinationId)}` : "Return flight", date: request.returnDate, destinationId: last.destinationId, fromDestinationId: last.destinationId });
  return [...slots, ...hotels];
}

