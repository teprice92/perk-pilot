import type { Cabin, FlightOffer } from "@/lib/domain/types";
import { cached } from "@/lib/server/cache";
import type { FlightProvider, FlightSearchParams, FlightSearchResult, ProviderInfo } from "../types";

/**
 * Duffel adapter — live CASH fares only (Duffel does not sell award seats).
 *
 * Enabled when DUFFEL_ACCESS_TOKEN is set AND PERKPILOT_LIVE_FLIGHTS=duffel.
 * Live offers carry no award pricing, so the optimizer will only compare cash
 * and portal redemptions for them unless an award provider is also enabled —
 * PerkPilot never mixes demo award estimates into live results.
 *
 * Offers expire (typically within ~30 minutes); results are cached for 10
 * minutes and must be re-priced before booking. See docs/PROVIDERS.md.
 */

const API = "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=15000";

interface DuffelSegment {
  departing_at: string;
  arriving_at: string;
  origin: { iata_code: string };
  destination: { iata_code: string };
  marketing_carrier: { iata_code: string; name: string };
  marketing_carrier_flight_number: string;
  passengers?: Array<{ cabin_class?: string }>;
}
interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { iata_code: string; name: string };
  conditions?: { refund_before_departure?: { allowed?: boolean } | null };
  slices: Array<{ duration?: string; segments: DuffelSegment[] }>;
}

export function duffelInfo(): ProviderInfo {
  return {
    id: "duffel",
    name: "Duffel (cash airfare)",
    category: "flights_cash",
    configured: Boolean(process.env.DUFFEL_ACCESS_TOKEN) && process.env.PERKPILOT_LIVE_FLIGHTS === "duffel",
    dataKind: "live",
    docsUrl: "https://duffel.com/docs",
    notes: "Live cash fares. Set DUFFEL_ACCESS_TOKEN and PERKPILOT_LIVE_FLIGHTS=duffel. Offers expire quickly — always re-price before booking.",
    envVars: ["DUFFEL_ACCESS_TOKEN", "PERKPILOT_LIVE_FLIGHTS"],
  };
}

/** ISO-8601 duration (PT11H5M) → minutes. */
export function isoDurationMinutes(d?: string): number {
  if (!d) return 0;
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const hhmm = (iso: string) => iso.slice(11, 16);

export function mapDuffelOffer(o: DuffelOffer, direction: "outbound" | "return", passengers: number, cabin: Cabin, fetchedAt: string): FlightOffer | null {
  if (o.total_currency !== "USD") return null; // currency conversion is intentionally not guessed
  const slice = o.slices[0];
  if (!slice?.segments.length) return null;
  const first = slice.segments[0]!;
  const last = slice.segments[slice.segments.length - 1]!;
  const duration = isoDurationMinutes(slice.duration) || Math.round((Date.parse(last.arriving_at) - Date.parse(first.departing_at)) / 60_000);
  return {
    id: `duffel-${o.id}`,
    provider: "Duffel",
    dataKind: "live",
    fetchedAt,
    direction,
    origin: first.origin.iata_code,
    destination: last.destination.iata_code,
    date: first.departing_at.slice(0, 10),
    departTime: hhmm(first.departing_at),
    arriveTime: hhmm(last.arriving_at),
    arrivesNextDay: last.arriving_at.slice(0, 10) > first.departing_at.slice(0, 10),
    durationMin: duration,
    stops: slice.segments.length - 1,
    via: slice.segments.length > 1 ? slice.segments[0]!.destination.iata_code : undefined,
    carrier: o.owner.iata_code,
    carrierName: o.owner.name,
    flightNumbers: slice.segments.map((s) => `${s.marketing_carrier.iata_code}${s.marketing_carrier_flight_number}`),
    cabin: (first.passengers?.[0]?.cabin_class as Cabin | undefined) ?? cabin,
    cashPerPersonCents: Math.round((Number(o.total_amount) * 100) / Math.max(1, passengers)),
    refundable: Boolean(o.conditions?.refund_before_departure?.allowed),
    awards: [],
    bookingUrl: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${first.origin.iata_code} to ${last.destination.iata_code} on ${first.departing_at.slice(0, 10)}`)}`,
  };
}

async function searchOneWay(origin: string, destination: string, date: string, adults: number, children: number, cabin: Cabin, maxConnections: number): Promise<DuffelOffer[]> {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) throw new Error("DUFFEL_ACCESS_TOKEN is not set");
  const passengers = [...Array.from({ length: adults }, () => ({ type: "adult" })), ...Array.from({ length: children }, () => ({ age: 10 }))];
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Duffel-Version": "v2", Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ data: { slices: [{ origin, destination, departure_date: date }], passengers, cabin_class: cabin, max_connections: maxConnections } }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Duffel ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { offers?: DuffelOffer[] } };
  return json.data?.offers ?? [];
}

export const duffelFlightProvider: FlightProvider = {
  info: duffelInfo,
  async searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
    const fetchedAt = new Date().toISOString();
    const pax = params.adults + params.children;
    const warnings: string[] = [];
    const run = async (direction: "outbound" | "return") => {
      const out: FlightOffer[] = [];
      for (const airport of params.destinationAirports) {
        for (const cabin of params.cabins) {
          const [from, to, date] = direction === "outbound" ? [params.origin, airport, params.departDate] : [airport, params.origin, params.returnDate];
          try {
            const offers = await cached(`duffel:${from}:${to}:${date}:${cabin}:${params.adults}:${params.children}`, 10 * 60_000, () => searchOneWay(from, to, date, params.adults, params.children, cabin, 1));
            const mapped = offers.map((o) => mapDuffelOffer(o, direction, pax, cabin, fetchedAt)).filter((x): x is FlightOffer => x !== null);
            // Keep the cheapest few per carrier to bound payload size.
            const byCarrier = new Map<string, FlightOffer[]>();
            for (const m of mapped.sort((a, b) => a.cashPerPersonCents - b.cashPerPersonCents)) {
              const list = byCarrier.get(m.carrier) ?? [];
              if (list.length < 2) byCarrier.set(m.carrier, [...list, m]);
            }
            out.push(...[...byCarrier.values()].flat());
          } catch (e) {
            warnings.push(`Duffel search ${from}→${to} (${cabin}) failed: ${e instanceof Error ? e.message : "error"}`);
          }
        }
      }
      return out;
    };
    const [outbound, ret] = await Promise.all([run("outbound"), run("return")]);
    warnings.push("Live cash fares from Duffel. Award pricing is not included for live results.");
    return { outbound, return: ret, dateInsights: [], provider: "Duffel", dataKind: "live", warnings };
  },
};
