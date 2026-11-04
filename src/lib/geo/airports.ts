import { AIRPORTS } from "@/lib/providers/demo/catalog";
import { haversineKm } from "@/lib/providers/demo/geo";
import WORLD from "./world-airports.json";

/**
 * World airports with scheduled passenger service (OurAirports, public
 * domain): [IATA, name, city, ISO country, lat, lng, isLarge]. Server-side
 * only — it's ~230 KB, so client code must not import this module.
 */
type Row = [string, string, string, string, number, number, number];

export interface AirportInfo {
  code: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  large: boolean;
  /** Standard-time UTC offset (approximate for world airports; demo scheduling only). */
  tz: number;
}

const BY_CODE = new Map<string, AirportInfo>();
for (const [code, name, city, country, lat, lng, large] of WORLD as Row[]) {
  BY_CODE.set(code, { code, name, city, country, lat, lng, large: large === 1, tz: Math.round(lng / 15) });
}

/** Curated airports (exact time zones) first, then the world list. */
export function airportInfo(code: string): AirportInfo | undefined {
  const c = AIRPORTS[code];
  const w = BY_CODE.get(code);
  if (c) return { code, name: w?.name ?? c.city, city: c.city, country: c.country, lat: c.lat, lng: c.lng, large: w?.large ?? true, tz: c.tz ?? w?.tz ?? Math.round(c.lng / 15) };
  return w;
}

/**
 * The airports a traveller would realistically fly into for a point: the
 * nearest big airport within reach, plus a closer regional one if there is
 * one. Returns at most `max` codes, nearest-useful first.
 */
export function nearestAirports(lat: number, lng: number, max = 2, radiusKm = 220): Array<{ code: string; km: number; large: boolean }> {
  const near: Array<{ code: string; km: number; large: boolean }> = [];
  for (const a of BY_CODE.values()) {
    if (Math.abs(a.lat - lat) > 3 || Math.abs(a.lng - lng) > 4 / Math.max(0.2, Math.cos((lat * Math.PI) / 180))) continue;
    const km = haversineKm(lat, lng, a.lat, a.lng);
    if (km <= radiusKm) near.push({ code: a.code, km, large: a.large });
  }
  // Large airports "feel" closer: a hub 120 km away usually beats a regional field 60 km away.
  near.sort((a, b) => a.km * (a.large ? 0.45 : 1) - b.km * (b.large ? 0.45 : 1));
  const picked: typeof near = [];
  const firstLarge = near.find((a) => a.large);
  if (firstLarge) picked.push(firstLarge);
  for (const a of near) {
    if (picked.length >= max) break;
    if (picked.some((p) => p.code === a.code)) continue;
    // Only add a second airport if it is genuinely convenient.
    if (picked.length === 0 || a.km <= Math.min(80, picked[0]!.km)) picked.push(a);
  }
  return picked.slice(0, max).sort((a, b) => a.km - b.km);
}

/** Offline fallback for place search: cities that have an airport. */
export function searchAirportCities(query: string, limit = 6): Array<{ name: string; country: string; lat: number; lng: number }> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const hits: Array<{ name: string; country: string; lat: number; lng: number; rank: number }> = [];
  for (const a of BY_CODE.values()) {
    const city = a.city.toLowerCase();
    const rank = a.code.toLowerCase() === q ? 0 : city === q ? 1 : city.startsWith(q) ? 2 : city.includes(q) ? 3 : -1;
    if (rank < 0 || !a.city) continue;
    const key = `${city}|${a.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ name: a.city, country: a.country, lat: a.lat, lng: a.lng, rank: rank * 2 + (a.large ? 0 : 1) });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).slice(0, limit);
}
