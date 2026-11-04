import { DESTINATIONS, placeId } from "@/lib/providers/demo/catalog";
import { haversineKm } from "@/lib/providers/demo/geo";
import { cached } from "@/lib/server/cache";
import { nearestAirports, searchAirportCities } from "./airports";

export interface PlaceSuggestion {
  id: string;
  name: string;
  /** "Porto, Portugal" style secondary line. */
  detail: string;
  airports: string[];
  kind: "catalog" | "place";
  /** e.g. "Fly into OPO (11 km)". */
  note?: string;
}

interface GeoHit {
  name: string;
  region?: string;
  countryCode: string;
  lat: number;
  lng: number;
  population?: number;
}

const GEOCODER = "https://geocoding-api.open-meteo.com/v1/search";

/** Open-Meteo geocoding (GeoNames data, no key; free for non-commercial use). */
async function geocode(query: string): Promise<GeoHit[]> {
  if (process.env.PERKPILOT_GEOCODER === "offline") return [];
  return cached(`geocode:${query.toLowerCase()}`, 24 * 3600_000, async () => {
    const url = new URL(GEOCODER);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "10");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`Geocoder ${res.status}`);
    const json = (await res.json()) as { results?: Array<{ name?: string; latitude?: number; longitude?: number; country_code?: string; admin1?: string; population?: number; feature_code?: string }> };
    return (json.results ?? [])
      .filter((r) => r.name && typeof r.latitude === "number" && typeof r.longitude === "number" && /^[A-Za-z]{2}$/.test(r.country_code ?? ""))
      // Populated places, islands and parks — skip things like buildings or streams.
      .filter((r) => !r.feature_code || /^(PPL|ISL|ADM|RGN|AREA|PRK|ATOL|BAY|MT|VAL|LK|CST|PEN)/.test(r.feature_code))
      .map((r) => ({ name: r.name!, region: r.admin1, countryCode: r.country_code!.toUpperCase(), lat: r.latitude!, lng: r.longitude!, population: r.population }));
  });
}

function catalogMatches(q: string): PlaceSuggestion[] {
  return DESTINATIONS.map((d) => {
    const name = d.name.toLowerCase();
    const rank = name === q || d.aliases.includes(q) ? 0 : name.startsWith(q) ? 1 : d.aliases.some((a) => a.startsWith(q)) ? 2 : name.includes(q) || d.country.toLowerCase().startsWith(q) ? 3 : -1;
    return { d, rank };
  })
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5)
    .map(({ d }) => ({ id: d.id, name: d.name, detail: `${d.country} · ${d.tagline}`, airports: d.airports, kind: "catalog" as const }));
}

function toSuggestion(h: GeoHit): PlaceSuggestion | null {
  const airports = nearestAirports(h.lat, h.lng);
  if (!airports.length) return null;
  let country = h.countryCode;
  try {
    country = new Intl.DisplayNames(["en"], { type: "region" }).of(h.countryCode) ?? h.countryCode;
  } catch {
    /* keep the code */
  }
  const near = airports[0]!;
  const region = h.region && h.region !== h.name ? h.region : undefined;
  return {
    id: placeId({ name: h.name, region, countryCode: h.countryCode, lat: h.lat, lng: h.lng, airports: airports.map((a) => a.code) }),
    name: h.name,
    detail: [region, country].filter(Boolean).join(", "),
    airports: airports.map((a) => a.code),
    kind: "place",
    note: near.km < 15 ? `Airport ${near.code}` : `Fly into ${airports.map((a) => a.code).join(" / ")} (${Math.round(near.km)} km)`,
  };
}

/**
 * Destination suggestions for a query: catalogue destinations first (richer
 * demo data), then anywhere in the world with an airport within reach.
 */
export async function searchPlaces(query: string): Promise<{ results: PlaceSuggestion[]; source: "geocoder" | "offline" }> {
  const q = query.trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return { results: [], source: "offline" };
  const catalog = catalogMatches(q);
  let hits: GeoHit[] = [];
  let source: "geocoder" | "offline" = "geocoder";
  try {
    hits = await geocode(q);
  } catch (e) {
    console.warn("[perkpilot] geocoder unavailable, using offline city list:", e instanceof Error ? e.message : e);
  }
  if (!hits.length) {
    source = "offline";
    hits = searchAirportCities(q).map((c) => ({ name: c.name, countryCode: c.country, lat: c.lat, lng: c.lng }));
  }
  const places: PlaceSuggestion[] = [];
  for (const h of hits) {
    // Already covered by a catalogue destination nearby with the same name.
    const dup = DESTINATIONS.some((d) => haversineKm(d.lat, d.lng, h.lat, h.lng) < 40 && (d.name.toLowerCase().includes(h.name.toLowerCase()) || d.aliases.includes(h.name.toLowerCase())));
    if (dup) continue;
    const s = toSuggestion(h);
    if (s && !places.some((p) => p.name === s.name && p.detail === s.detail)) places.push(s);
    if (places.length >= 6) break;
  }
  return { results: [...catalog, ...places].slice(0, 8), source };
}
