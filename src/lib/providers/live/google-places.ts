import type { ExperienceOffer, TravelStyle } from "@/lib/domain/types";
import { cached } from "@/lib/server/cache";
import { destinationById } from "../demo/catalog";
import type { ExperienceProvider, ExperienceSearchParams, ProviderInfo } from "../types";

/**
 * Google Places API (New) — Text Search for destination experiences.
 * Enabled with GOOGLE_PLACES_API_KEY + PERKPILOT_LIVE_EXPERIENCES=google-places.
 *
 * Places returns no ticket prices, so costs are coarse estimates from
 * `priceLevel` and flagged `priceEstimated`. No merchant tags are set, so no
 * card credit is ever assumed for these venues. Google Maps attribution is
 * required wherever Places content is shown, and content other than place IDs
 * must not be cached beyond the terms (see docs/PROVIDERS.md).
 */

const API = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.types,places.googleMapsUri,places.editorialSummary";

export function googlePlacesInfo(): ProviderInfo {
  return {
    id: "google-places",
    name: "Google Places (experiences)",
    category: "experiences",
    configured: Boolean(process.env.GOOGLE_PLACES_API_KEY) && process.env.PERKPILOT_LIVE_EXPERIENCES === "google-places",
    dataKind: "live",
    docsUrl: "https://developers.google.com/maps/documentation/places/web-service/text-search",
    notes: "Live places, ratings and locations. Prices are estimated from price level. Attribution and caching limits apply.",
    envVars: ["GOOGLE_PLACES_API_KEY", "PERKPILOT_LIVE_EXPERIENCES"],
  };
}

interface Place {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  priceLevel?: string;
  types?: string[];
  googleMapsUri?: string;
  editorialSummary?: { text: string };
}

const PRICE_PER_PERSON_USD: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 20,
  PRICE_LEVEL_MODERATE: 45,
  PRICE_LEVEL_EXPENSIVE: 95,
  PRICE_LEVEL_VERY_EXPENSIVE: 200,
};

const QUERIES: Array<{ q: string; category: ExperienceOffer["category"]; styles: TravelStyle[]; bestTime: ExperienceOffer["bestTime"]; duration: number }> = [
  { q: "top tourist attractions", category: "culture", styles: ["culture"], bestTime: "morning", duration: 150 },
  { q: "best fine dining restaurants", category: "dining", styles: ["food", "romantic", "luxury"], bestTime: "evening", duration: 150 },
  { q: "museums", category: "museum", styles: ["culture", "family"], bestTime: "afternoon", duration: 150 },
  { q: "spa", category: "wellness", styles: ["wellness", "romantic"], bestTime: "afternoon", duration: 120 },
  { q: "parks and nature", category: "nature", styles: ["nature", "adventure"], bestTime: "morning", duration: 150 },
  { q: "cocktail bars", category: "nightlife", styles: ["nightlife", "romantic"], bestTime: "evening", duration: 120 },
];

export function mapPlace(p: Place, meta: (typeof QUERIES)[number], destinationId: string): ExperienceOffer | null {
  if (!p.location || !p.displayName) return null;
  const price = p.priceLevel ? PRICE_PER_PERSON_USD[p.priceLevel] : meta.category === "dining" ? 95 : meta.category === "culture" || meta.category === "nature" ? 0 : 30;
  return {
    id: `places-${p.id}`,
    provider: "Google Places",
    dataKind: "live",
    name: p.displayName.text,
    description: p.editorialSummary?.text ?? p.formattedAddress ?? "",
    category: meta.category,
    styles: meta.styles,
    pricePerPersonCents: Math.round((price ?? 30) * 100),
    priceEstimated: true,
    durationMin: meta.duration,
    bestTime: meta.bestTime,
    neighborhood: p.formattedAddress?.split(",").slice(-3, -2)[0]?.trim() ?? "",
    lat: p.location.latitude,
    lng: p.location.longitude,
    rating: p.rating ?? 4.3,
    premium: p.priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE",
    tags: [],
    bookingUrl: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
    attribution: "Google Maps",
    destinationId,
  };
}

export const googlePlacesProvider: ExperienceProvider = {
  info: googlePlacesInfo,
  async searchExperiences({ destinationId, styles }: ExperienceSearchParams): Promise<ExperienceOffer[]> {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    const dest = destinationById(destinationId);
    if (!key || !dest) return [];
    const wanted = QUERIES.filter((q) => q.styles.some((s) => styles.includes(s)) || q.category === "culture").slice(0, 4);
    const results = await Promise.all(
      wanted.map((meta) =>
        cached(`places:${dest.id}:${meta.q}`, 6 * 3600_000, async () => {
          const res = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
            body: JSON.stringify({ textQuery: `${meta.q} in ${dest.name}`, maxResultCount: 5, locationBias: { circle: { center: { latitude: dest.lat, longitude: dest.lng }, radius: 20000 } } }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) throw new Error(`Places ${res.status}`);
          const json = (await res.json()) as { places?: Place[] };
          return (json.places ?? []).map((p) => mapPlace(p, meta, dest.id)).filter((x): x is ExperienceOffer => x !== null);
        }).catch(() => [] as ExperienceOffer[]),
      ),
    );
    const seen = new Set<string>();
    return results.flat().filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  },
};
