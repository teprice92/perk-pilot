import type { ProviderInfo } from "../types";

/**
 * Duffel (cash fares) — adapter scaffold.
 * The adapter is intentionally not wired into search until it has been tested
 * against a Duffel test-mode token; see docs/PROVIDERS.md for the integration
 * checklist (licensing, rate limits, caching windows, offer expiry).
 */
export function duffelInfo(): ProviderInfo {
  return {
    id: "duffel",
    name: "Duffel (cash airfare)",
    category: "flights_cash",
    configured: Boolean(process.env.DUFFEL_ACCESS_TOKEN),
    dataKind: "live",
    docsUrl: "https://duffel.com/docs",
    notes: "Adapter scaffold. Offers expire quickly — always re-price before display. Not enabled until validated in test mode.",
    envVars: ["DUFFEL_ACCESS_TOKEN"],
  };
}
