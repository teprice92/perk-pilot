import type { Cabin, FlightOffer, HotelOffer } from "@/lib/domain/types";
import { cached } from "@/lib/server/cache";
import { destinationById } from "../demo/catalog";
import type { FlightProvider, FlightSearchParams, FlightSearchResult, HotelProvider, HotelSearchParams, LegSearchParams, ProviderInfo } from "../types";
import { isoDurationMinutes } from "./duffel";

/**
 * Amadeus for Developers (Self-Service) — live cash fares and hotel rates.
 *
 * Flights:  PERKPILOT_LIVE_FLIGHTS=amadeus
 * Hotels:   PERKPILOT_LIVE_HOTELS=amadeus
 * Credentials: AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET; AMADEUS_ENV=test|production.
 *
 * Amadeus returns no loyalty award pricing and no card-program participation,
 * so live hotels are offered as cash (and portal) bookings only — PerkPilot
 * does not guess FHR/THC/Edit eligibility for them.
 */

const base = () => (process.env.AMADEUS_ENV === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com");

export function amadeusConfigured(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

export function amadeusFlightsInfo(): ProviderInfo {
  return {
    id: "amadeus-flights",
    name: "Amadeus (cash airfare)",
    category: "flights_cash",
    configured: amadeusConfigured() && process.env.PERKPILOT_LIVE_FLIGHTS === "amadeus",
    dataKind: "live",
    docsUrl: "https://developers.amadeus.com/self-service/category/flights",
    notes: "Live cash fares (Flight Offers Search). Test environment data is limited and cached; production needs approval.",
    envVars: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET", "AMADEUS_ENV", "PERKPILOT_LIVE_FLIGHTS"],
  };
}

export function amadeusHotelsInfo(): ProviderInfo {
  return {
    id: "amadeus-hotels",
    name: "Amadeus (hotel rates)",
    category: "hotels",
    configured: amadeusConfigured() && process.env.PERKPILOT_LIVE_HOTELS === "amadeus",
    dataKind: "live",
    docsUrl: "https://developers.amadeus.com/self-service/category/hotels",
    notes: "Live hotel offers near the destination. No loyalty award or card-program data — those stay cash/portal options.",
    envVars: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET", "AMADEUS_ENV", "PERKPILOT_LIVE_HOTELS"],
  };
}

let token: { value: string; expires: number } | null = null;
let inflight: Promise<string> | null = null;

/** Client-credentials token, cached until shortly before expiry. Concurrent callers share one request. */
export async function amadeusToken(): Promise<string> {
  if (token && token.expires > Date.now() + 30_000) return token.value;
  if (inflight) return inflight;
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Amadeus credentials are not set");
  inflight = (async () => {
    try {
      const res = await fetch(`${base()}/v1/security/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Amadeus auth ${res.status}`);
      const json = (await res.json()) as { access_token: string; expires_in: number };
      token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
      return token.value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function resetAmadeusToken() {
  token = null;
  inflight = null;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(base() + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await amadeusToken()}`, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`Amadeus ${path} ${res.status}`);
  return (await res.json()) as T;
}

/* ─────────────── Flights ─────────────── */

interface AmadeusSegment {
  departure: { iataCode: string; at: string };
  arrival: { iataCode: string; at: string };
  carrierCode: string;
  number: string;
}
export interface AmadeusFlightOffer {
  id: string;
  itineraries: Array<{ duration?: string; segments: AmadeusSegment[] }>;
  price: { currency: string; grandTotal: string };
  validatingAirlineCodes?: string[];
  travelerPricings?: Array<{ fareDetailsBySegment?: Array<{ cabin?: string }> }>;
  pricingOptions?: { refundableFare?: boolean };
}

const CABIN_TO_AMADEUS: Record<Cabin, string> = { economy: "ECONOMY", premium_economy: "PREMIUM_ECONOMY", business: "BUSINESS", first: "FIRST" };

export function mapAmadeusFlight(o: AmadeusFlightOffer, direction: FlightOffer["direction"], pax: number, cabin: Cabin, carriers: Record<string, string>, fetchedAt: string): FlightOffer | null {
  if (o.price.currency !== "USD") return null;
  const it = o.itineraries[0];
  if (!it?.segments.length) return null;
  const first = it.segments[0]!;
  const last = it.segments[it.segments.length - 1]!;
  const carrier = o.validatingAirlineCodes?.[0] ?? first.carrierCode;
  const reportedCabin = o.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin?.toLowerCase() as Cabin | undefined;
  return {
    id: `amadeus-${direction}-${o.id}-${first.departure.at}`,
    provider: "Amadeus",
    dataKind: "live",
    fetchedAt,
    direction,
    origin: first.departure.iataCode,
    destination: last.arrival.iataCode,
    date: first.departure.at.slice(0, 10),
    departTime: first.departure.at.slice(11, 16),
    arriveTime: last.arrival.at.slice(11, 16),
    arrivesNextDay: last.arrival.at.slice(0, 10) > first.departure.at.slice(0, 10),
    durationMin: isoDurationMinutes(it.duration),
    stops: it.segments.length - 1,
    via: it.segments.length > 1 ? first.arrival.iataCode : undefined,
    carrier,
    carrierName: carriers[carrier] ?? carrier,
    flightNumbers: it.segments.map((s) => `${s.carrierCode}${s.number}`),
    cabin: reportedCabin && reportedCabin in CABIN_TO_AMADEUS ? reportedCabin : cabin,
    cashPerPersonCents: Math.round((Number(o.price.grandTotal) * 100) / Math.max(1, pax)),
    refundable: Boolean(o.pricingOptions?.refundableFare),
    awards: [],
    bookingUrl: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${first.departure.iataCode} to ${last.arrival.iataCode} on ${first.departure.at.slice(0, 10)}`)}`,
  };
}

async function searchOneWay(from: string, to: string, date: string, adults: number, children: number, cabin: Cabin, direction: FlightOffer["direction"]): Promise<FlightOffer[]> {
  const fetchedAt = new Date().toISOString();
  const json = await cached(`amadeus:fl:${from}:${to}:${date}:${cabin}:${adults}:${children}`, 10 * 60_000, () =>
    get<{ data?: AmadeusFlightOffer[]; dictionaries?: { carriers?: Record<string, string> } }>("/v2/shopping/flight-offers", {
      originLocationCode: from,
      destinationLocationCode: to,
      departureDate: date,
      adults: String(adults),
      ...(children ? { children: String(children) } : {}),
      travelClass: CABIN_TO_AMADEUS[cabin],
      currencyCode: "USD",
      max: "20",
    }),
  );
  const carriers = json.dictionaries?.carriers ?? {};
  const mapped = (json.data ?? []).map((o) => mapAmadeusFlight(o, direction, adults + children, cabin, carriers, fetchedAt)).filter((x): x is FlightOffer => x !== null && x.stops <= 1);
  const byCarrier = new Map<string, FlightOffer[]>();
  for (const m of mapped.sort((a, b) => a.cashPerPersonCents - b.cashPerPersonCents)) {
    const list = byCarrier.get(m.carrier) ?? [];
    if (list.length < 2) byCarrier.set(m.carrier, [...list, m]);
  }
  return [...byCarrier.values()].flat();
}

export const amadeusFlightProvider: FlightProvider = {
  info: amadeusFlightsInfo,
  async searchFlights(p: FlightSearchParams): Promise<FlightSearchResult> {
    const warnings: string[] = [];
    const run = async (direction: "outbound" | "return") => {
      const out: FlightOffer[] = [];
      for (const airport of p.destinationAirports) {
        for (const cabin of p.cabins) {
          const [from, to, date] = direction === "outbound" ? [p.origin, airport, p.departDate] : [airport, p.origin, p.returnDate];
          try {
            out.push(...(await searchOneWay(from, to, date, p.adults, p.children, cabin, direction)));
          } catch (e) {
            warnings.push(`Amadeus ${from}→${to} (${cabin}) failed: ${e instanceof Error ? e.message : "error"}`);
          }
        }
      }
      return out;
    };
    const [outbound, ret] = await Promise.all([run("outbound"), run("return")]);
    warnings.push("Live cash fares from Amadeus.");
    return { outbound, return: ret, dateInsights: [], provider: "Amadeus", dataKind: "live", warnings };
  },
  async searchLeg(p: LegSearchParams) {
    const offers: FlightOffer[] = [];
    const warnings: string[] = [];
    for (const from of p.from) for (const to of p.to) for (const cabin of p.cabins) {
      try {
        offers.push(...(await searchOneWay(from, to, p.date, p.adults, p.children, cabin, "leg")));
      } catch (e) {
        warnings.push(`Amadeus ${from}→${to} (${cabin}) failed: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    return { offers, warnings };
  },
};

/* ─────────────── Hotels ─────────────── */

/** Amadeus chain codes → loyalty program (paid stays earn/elite only). */
export const CHAIN_TO_PROGRAM: Record<string, string> = {
  HY: "hyatt", MC: "marriott", RC: "marriott", WH: "marriott", SI: "marriott", LC: "marriott", EB: "marriott", WI: "marriott", MD: "marriott", AR: "marriott",
  HH: "hilton", HL: "hilton", WA: "hilton", CN: "hilton", DT: "hilton", ES: "hilton", QQ: "hilton",
  IC: "ihg", HI: "ihg", YO: "ihg", KI: "ihg", YZ: "ihg", VN: "ihg",
  CI: "choice", CC: "choice",
};

interface AmadeusHotelOffers {
  hotel: { hotelId: string; name: string; latitude?: number; longitude?: number; chainCode?: string; cityCode?: string };
  offers?: Array<{ price: { currency: string; total: string; base?: string }; policies?: { paymentType?: string; cancellations?: Array<{ deadline?: string }> }; boardType?: string }>;
}

export function mapAmadeusHotel(h: AmadeusHotelOffers, nights: number, rooms: number, destinationId: string, fetchedAt: string, i: number): HotelOffer | null {
  const offer = h.offers?.[0];
  if (!offer || offer.price.currency !== "USD" || !h.hotel.latitude || !h.hotel.longitude) return null;
  const total = Number(offer.price.total);
  const base = Number(offer.price.base ?? offer.price.total);
  const nightly = Math.round((base * 100) / Math.max(1, nights * rooms));
  const refundable = Boolean(offer.policies?.cancellations?.some((c) => c.deadline));
  const name = h.hotel.name.replace(/\b\w+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
  return {
    id: `amadeus-hotel-${h.hotel.hotelId}`,
    provider: "Amadeus",
    dataKind: "live",
    fetchedAt,
    name,
    description: "Live rate from Amadeus. Check Amex Travel / Chase Travel for program eligibility (FHR, THC, The Edit).",
    tier: nightly > 60_000 ? "luxury" : "upscale",
    stars: nightly > 60_000 ? 5 : 4,
    rating: 4.4,
    chainProgramId: h.hotel.chainCode ? CHAIN_TO_PROGRAM[h.hotel.chainCode] : undefined,
    neighborhood: h.hotel.cityCode ?? "",
    lat: h.hotel.latitude,
    lng: h.hotel.longitude,
    nightlyCashCents: nightly,
    taxesPct: base > 0 ? Math.max(0, total / base - 1) : 0,
    resortFeePerNightCents: 0,
    includesBreakfast: (offer.boardType ?? "").includes("BREAKFAST"),
    refundable,
    cancellationPolicy: refundable ? "Free cancellation before the provider's deadline" : "Check cancellation terms",
    programs: [],
    amenities: [],
    tags: [],
    hue: (i * 47) % 360,
    bookingUrl: `https://www.google.com/travel/hotels?q=${encodeURIComponent(name)}`,
    destinationId,
  };
}

export const amadeusHotelProvider: HotelProvider = {
  info: amadeusHotelsInfo,
  async searchHotels(p: HotelSearchParams): Promise<HotelOffer[]> {
    const dest = destinationById(p.destinationId);
    if (!dest) return [];
    const fetchedAt = new Date().toISOString();
    const nights = Math.max(1, Math.round((Date.parse(p.checkOut) - Date.parse(p.checkIn)) / 86_400_000));
    const rooms = Math.max(1, Math.ceil(p.guests / 2));
    const list = await cached(`amadeus:hl:${dest.id}`, 24 * 3600_000, () =>
      get<{ data?: Array<{ hotelId: string }> }>("/v1/reference-data/locations/hotels/by-geocode", { latitude: String(dest.lat), longitude: String(dest.lng), radius: "8", radiusUnit: "KM", ratings: "4,5" }),
    );
    const ids = (list.data ?? []).slice(0, 20).map((h) => h.hotelId);
    if (!ids.length) return [];
    const offers = await cached(`amadeus:ho:${ids.join(",")}:${p.checkIn}:${p.checkOut}:${p.guests}`, 15 * 60_000, () =>
      get<{ data?: AmadeusHotelOffers[] }>("/v3/shopping/hotel-offers", { hotelIds: ids.join(","), adults: String(Math.min(2, p.guests)), roomQuantity: String(rooms), checkInDate: p.checkIn, checkOutDate: p.checkOut, currency: "USD", bestRateOnly: "true" }),
    );
    return (offers.data ?? []).map((h, i) => mapAmadeusHotel(h, nights, rooms, dest.id, fetchedAt, i)).filter((x): x is HotelOffer => x !== null).slice(0, 8);
  },
};
