import type { HotelOffer } from "@/lib/domain/types";
import { googleHotelsUrl } from "@/lib/links";
import { cached } from "@/lib/server/cache";
import { destinationById } from "../demo/catalog";
import type { HotelProvider, HotelSearchParams, ProviderInfo } from "../types";

/**
 * Rooms.aero Partner API — real hotel award availability (cached snapshots).
 *
 * Same key and subscription as Seats.aero Pro (non-commercial use; separate
 * 1,000 calls/day quota). Enabled with SEATS_AERO_API_KEY +
 * PERKPILOT_LIVE_HOTEL_AWARDS=rooms-aero.
 *
 * Field names follow the Partner API objects (Hotel, SearchResult). Two
 * details the public docs don't pin down are handled defensively:
 *  - Cash price units: we compare the API's own cents-per-point with
 *    cash/points to tell dollars from cents, and drop the cash price (and
 *    the hotel) when it can't be reconciled or isn't USD — never guessed.
 *  - Points per night vs per stay: pricing comes from a 1-night search, and a
 *    second search for the full stay (max 5 nights) confirms availability.
 * Results are "cached" data: award space seen recently, not guaranteed.
 */

const API = "https://rooms.aero/partnerapi";

/** Rooms.aero `source` → PerkPilot program id (programs PerkPilot models). */
export const ROOMS_SOURCE_TO_PROGRAM: Record<string, string> = {
  hyatt: "hyatt",
  marriott: "marriott",
  hilton: "hilton",
  ihg: "ihg",
  choice: "choice",
};

/** Per-night points at or above which we call a property "luxury" (tier is estimated). */
const LUXURY_POINTS: Record<string, number> = { hyatt: 25_000, marriott: 70_000, hilton: 90_000, ihg: 70_000, choice: 35_000 };

export interface RoomsHotel {
  id: string;
  source: string;
  program?: string;
  name: string;
  brand?: string;
  award_category?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  url?: string;
  open?: boolean;
  last_checked_at?: string | null;
}

export interface RoomsSearchResult {
  hotel?: RoomsHotel | null;
  lowest_award_standard?: number;
  lowest_cash_standard?: number;
  currency_code?: string;
  standard_date?: string;
  standard_nights?: number;
  cpp?: number;
  last_checked_at?: string | null;
}

export function roomsAeroInfo(): ProviderInfo {
  return {
    id: "rooms-aero",
    name: "Rooms.aero (hotel award availability)",
    category: "hotel_awards",
    configured: Boolean(process.env.SEATS_AERO_API_KEY) && process.env.PERKPILOT_LIVE_HOTEL_AWARDS === "rooms-aero",
    dataKind: "cached",
    docsUrl: "https://developers.seats.aero/reference/rooms-getting-started",
    notes: "Real award nights at Hyatt, Marriott, Hilton, IHG and Choice hotels. Uses your Seats.aero Pro key (non-commercial use). Set PERKPILOT_LIVE_HOTEL_AWARDS=rooms-aero.",
    envVars: ["SEATS_AERO_API_KEY", "PERKPILOT_LIVE_HOTEL_AWARDS"],
  };
}

/**
 * Convert a reported cash amount to USD cents, using the API's cents-per-point
 * to decide whether the amount is in dollars or cents. Returns null when the
 * currency isn't USD or the numbers don't reconcile.
 */
export function cashToCents(cash: number | undefined, points: number | undefined, cpp: number | undefined, currency: string | undefined): number | null {
  if (!cash || cash <= 0 || !points || points <= 0) return null;
  if ((currency ?? "USD").toUpperCase() !== "USD") return null;
  const ifDollars = (cash * 100) / points; // cpp if cash is in dollars
  const ifCents = cash / points; // cpp if cash is in cents
  if (cpp && cpp > 0) {
    const close = (x: number) => Math.abs(x - cpp) / cpp < 0.15;
    if (close(ifDollars) && !close(ifCents)) return Math.round(cash * 100);
    if (close(ifCents) && !close(ifDollars)) return Math.round(cash);
    return null;
  }
  // No cpp to reconcile against: accept only a plausible nightly dollar figure.
  return cash >= 40 && cash <= 5_000 ? Math.round(cash * 100) : null;
}

export function mapRoomsResult(r: RoomsSearchResult, destinationId: string, stayVerified: boolean, maxVerifiedNights: number, nights: number, index: number): HotelOffer | null {
  const h = r.hotel;
  if (!h || h.open === false) return null;
  const programId = ROOMS_SOURCE_TO_PROGRAM[h.source];
  if (!programId || h.latitude === undefined || h.longitude === undefined) return null;
  const points = r.lowest_award_standard;
  if (!points || points <= 0) return null;
  const nightly = cashToCents(r.lowest_cash_standard, points, r.cpp, r.currency_code);
  if (nightly === null) return null;
  const luxury = points >= (LUXURY_POINTS[programId] ?? Infinity);
  const notes = [
    "Points and cash are for the first night as seen by Rooms.aero; other nights can price differently.",
    ...(stayVerified
      ? nights > maxVerifiedNights
        ? [`Award space was confirmed for ${maxVerifiedNights} consecutive nights (the search limit) — check the rest of your stay.`]
        : []
      : ["Award space was seen for your arrival night only — check the full stay."]),
    "Cash rate as reported; taxes and fees may be extra.",
  ];
  return {
    id: `rooms-${h.id}`,
    provider: "Rooms.aero",
    dataKind: "cached",
    fetchedAt: r.last_checked_at ?? h.last_checked_at ?? new Date().toISOString(),
    name: h.name,
    description: [h.brand, h.award_category ? `Award category ${h.award_category}` : null, h.address].filter(Boolean).join(" · ") || h.description || "",
    tier: luxury ? "luxury" : "upscale",
    tierEstimated: true,
    stars: luxury ? 5 : 4,
    rating: 4.5,
    ratingUnknown: true,
    chainProgramId: programId,
    neighborhood: h.city ?? "",
    lat: h.latitude,
    lng: h.longitude,
    nightlyCashCents: nightly,
    taxesPct: 0,
    resortFeePerNightCents: 0,
    includesBreakfast: false,
    refundable: false,
    cancellationPolicy: "Check the hotel's cancellation terms for cash rates; award stays are usually refundable.",
    programs: [],
    award: { programId, pointsPerNight: points, availability: "cached" },
    amenities: [],
    tags: [],
    hue: (index * 53 + 20) % 360,
    bookingUrl: h.url && /^https:\/\//.test(h.url) ? h.url : googleHotelsUrl(h.name, h.city ?? ""),
    destinationId,
    sourceNotes: notes,
  };
}

async function search(params: Record<string, string>): Promise<RoomsSearchResult[]> {
  const key = process.env.SEATS_AERO_API_KEY;
  if (!key) throw new Error("SEATS_AERO_API_KEY is not set");
  const url = new URL(`${API}/search`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return cached(`rooms:${url.search}`, 30 * 60_000, async () => {
    const res = await fetch(url, { headers: { "Partner-Authorization": key, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Rooms.aero ${res.status}`);
    const json = (await res.json()) as { data?: RoomsSearchResult[] };
    return json.data ?? [];
  });
}

export const roomsAeroProvider: HotelProvider = {
  info: roomsAeroInfo,
  async searchHotels(p: HotelSearchParams): Promise<HotelOffer[]> {
    const dest = destinationById(p.destinationId);
    if (!dest) return [];
    const nights = Math.max(1, Math.round((Date.parse(p.checkOut) - Date.parse(p.checkIn)) / 86_400_000));
    const stayNights = Math.min(5, nights);
    const base = { location: `${dest.name.split(" & ")[0]}, ${dest.country}`, start_date: p.checkIn, end_date: p.checkIn, source: Object.keys(ROOMS_SOURCE_TO_PROGRAM).join(","), take: "60" };
    const [firstNight, fullStay] = await Promise.all([search({ ...base, nights: "1" }), stayNights > 1 ? search({ ...base, nights: String(stayNights) }) : Promise.resolve(null)]);
    const verified = new Set((fullStay ?? []).map((r) => r.hotel?.id).filter(Boolean) as string[]);
    const isVerified = (r: RoomsSearchResult) => fullStay === null || verified.has(r.hotel?.id ?? "");
    // Full-stay-confirmed hotels first, then the best cents-per-point.
    return [...firstNight]
      .sort((a, b) => Number(isVerified(b)) - Number(isVerified(a)) || (b.cpp ?? 0) - (a.cpp ?? 0))
      .map((r, i) => mapRoomsResult(r, dest.id, isVerified(r), stayNights, nights, i))
      .filter((h): h is HotelOffer => h !== null)
      .slice(0, 10);
  },
};
