import type { Cabin } from "@/lib/domain/types";
import { cached } from "@/lib/server/cache";
import type { AwardAvailability, AwardProvider, AwardSearchParams, ProviderInfo } from "../types";

/**
 * Seats.aero Partner API — CACHED award availability.
 *
 * Results are snapshots at route/date/cabin level, so they map to
 * `availability: "cached"` and are attached to every flight on that route that
 * the program can book, with an explicit "not necessarily this exact flight"
 * caveat. Enabled with SEATS_AERO_API_KEY + PERKPILOT_LIVE_AWARDS=seats-aero.
 *
 * Field names follow the Partner API's cached-search response; validate them
 * against the current docs before enabling in production (docs/PROVIDERS.md).
 */

const API = "https://seats.aero/partnerapi/search";

/** Seats.aero `Source` → PerkPilot program id. Sources not listed are ignored. */
export const SEATS_SOURCE_TO_PROGRAM: Record<string, string> = {
  united: "united",
  aeroplan: "aeroplan",
  virginatlantic: "virgin",
  flyingblue: "flyingblue",
  delta: "delta",
  emirates: "emirates",
  qantas: "qantas",
  lifemiles: "avianca",
  jetblue: "jetblue",
  qatar: "qatar",
  singapore: "singapore",
};

const CABIN_PREFIX: Record<Cabin, "Y" | "W" | "J" | "F"> = { economy: "Y", premium_economy: "W", business: "J", first: "F" };

export interface SeatsAeroRow {
  ID?: string;
  Date: string;
  Source: string;
  Route?: { OriginAirport: string; DestinationAirport: string };
  UpdatedAt?: string;
  [key: string]: unknown;
}

export function seatsAeroInfo(): ProviderInfo {
  return {
    id: "seats-aero",
    name: "Seats.aero (award availability)",
    category: "flights_award",
    configured: Boolean(process.env.SEATS_AERO_API_KEY) && process.env.PERKPILOT_LIVE_AWARDS === "seats-aero",
    dataKind: "cached",
    docsUrl: "https://developers.seats.aero",
    notes: "Cached award space by route/date/cabin. Set SEATS_AERO_API_KEY and PERKPILOT_LIVE_AWARDS=seats-aero. Commercial use requires a partner agreement.",
    envVars: ["SEATS_AERO_API_KEY", "PERKPILOT_LIVE_AWARDS"],
  };
}

export function mapSeatsAeroRow(row: SeatsAeroRow, cabins: Cabin[]): AwardAvailability[] {
  const programId = SEATS_SOURCE_TO_PROGRAM[row.Source];
  if (!programId || !row.Route) return [];
  const out: AwardAvailability[] = [];
  for (const cabin of cabins) {
    const p = CABIN_PREFIX[cabin];
    if (!row[`${p}Available`]) continue;
    const miles = Number(row[`${p}MileageCost`]);
    if (!Number.isFinite(miles) || miles <= 0) continue;
    const taxesRaw = row[`${p}TotalTaxes`];
    const currency = (row.TaxesCurrency as string | undefined) ?? "USD";
    const carriers = typeof row[`${p}Airlines`] === "string" ? String(row[`${p}Airlines`]).split(",").map((c) => c.trim()).filter(Boolean) : undefined;
    out.push({
      programId,
      origin: row.Route.OriginAirport,
      destination: row.Route.DestinationAirport,
      date: row.Date.slice(0, 10),
      cabin,
      pointsPerPerson: Math.round(miles),
      // Taxes are only trusted when reported in USD (minor units).
      taxesPerPersonCents: typeof taxesRaw === "number" && currency === "USD" ? Math.round(taxesRaw) : undefined,
      seats: typeof row[`${p}RemainingSeats`] === "number" ? (row[`${p}RemainingSeats`] as number) : undefined,
      direct: Boolean(row[`${p}Direct`]),
      carriers,
      seenAt: row.UpdatedAt ?? new Date().toISOString(),
      source: "Seats.aero",
      status: "cached",
    });
  }
  return out;
}

export const seatsAeroProvider: AwardProvider = {
  info: seatsAeroInfo,
  async searchAwards(params: AwardSearchParams): Promise<AwardAvailability[]> {
    const key = process.env.SEATS_AERO_API_KEY;
    if (!key) throw new Error("SEATS_AERO_API_KEY is not set");
    const url = new URL(API);
    url.searchParams.set("origin_airport", params.origin);
    url.searchParams.set("destination_airport", params.destination);
    url.searchParams.set("start_date", params.date);
    url.searchParams.set("end_date", params.date);
    url.searchParams.set("take", "500");
    const rows = await cached(`seats:${url.search}`, 30 * 60_000, async () => {
      const res = await fetch(url, { headers: { "Partner-Authorization": key, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Seats.aero ${res.status}`);
      const json = (await res.json()) as { data?: SeatsAeroRow[] };
      return json.data ?? [];
    });
    return rows.flatMap((r) => mapSeatsAeroRow(r, params.cabins));
  },
};
