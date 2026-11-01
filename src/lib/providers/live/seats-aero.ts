import type { ProviderInfo } from "../types";

/**
 * Seats.aero (cached award availability) — adapter scaffold.
 * Results are cached snapshots, so they must be presented as "cached" with
 * their age, and users must confirm on the airline site before transferring.
 */
export function seatsAeroInfo(): ProviderInfo {
  return {
    id: "seats-aero",
    name: "Seats.aero (award availability)",
    category: "flights_award",
    configured: Boolean(process.env.SEATS_AERO_API_KEY),
    dataKind: "cached",
    docsUrl: "https://developers.seats.aero",
    notes: "Adapter scaffold. Partner API terms restrict commercial use — confirm licensing before enabling.",
    envVars: ["SEATS_AERO_API_KEY"],
  };
}
