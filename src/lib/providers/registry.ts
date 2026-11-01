import type { ExperienceProvider, FlightProvider, HotelProvider, ProviderInfo } from "./types";
import { buildExperiences, buildHotels, destinationById } from "./demo/destinations";
import { generateFlights } from "./demo/flights";
import { duffelFlightProvider, duffelInfo } from "./live/duffel";
import { seatsAeroInfo } from "./live/seats-aero";

/* ───────────── Demo providers (always available, clearly labelled) ───────────── */

export const demoFlightProvider: FlightProvider = {
  info: () => ({
    id: "demo-flights",
    name: "PerkPilot demo flight model",
    category: "flights_cash",
    configured: true,
    dataKind: "demo",
    notes: "Deterministic sample fares and award estimates. Not live prices or availability.",
    envVars: [],
  }),
  async searchFlights(params) {
    const dest = destinationById((params as { destinationId?: string }).destinationId ?? "");
    return generateFlights({
      ...params,
      destinationId: dest?.id ?? "",
      bestMonths: dest?.bestMonths ?? [],
    });
  },
};

export const demoHotelProvider: HotelProvider = {
  info: () => ({
    id: "demo-hotels",
    name: "PerkPilot demo hotel catalogue",
    category: "hotels",
    configured: true,
    dataKind: "demo",
    notes: "Fictional properties with illustrative rates and program participation.",
    envVars: [],
  }),
  async searchHotels({ destinationId, checkIn }) {
    const dest = destinationById(destinationId);
    const month = Number(checkIn.slice(5, 7));
    const factor = dest?.bestMonths.includes(month) ? 1.12 : 0.95;
    return buildHotels(destinationId, factor, new Date().toISOString());
  },
};

export const demoExperienceProvider: ExperienceProvider = {
  info: () => ({
    id: "demo-experiences",
    name: "PerkPilot demo experiences",
    category: "experiences",
    configured: true,
    dataKind: "demo",
    notes: "Real landmarks with illustrative prices; restaurants are placeholder listings.",
    envVars: [],
  }),
  async searchExperiences({ destinationId }) {
    return buildExperiences(destinationId);
  },
};

/* ───────────── Live provider catalogue (Phase 3) ───────────── */

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

export function providerCatalogue(): ProviderInfo[] {
  return [
    demoFlightProvider.info(),
    demoHotelProvider.info(),
    demoExperienceProvider.info(),
    duffelInfo(),
    {
      id: "amadeus",
      name: "Amadeus Self-Service (flights & hotels)",
      category: "flights_cash",
      configured: Boolean(env("AMADEUS_CLIENT_ID") && env("AMADEUS_CLIENT_SECRET")),
      dataKind: "live",
      docsUrl: "https://developers.amadeus.com",
      notes: "Adapter planned. Review self-service quotas and production access terms before enabling.",
      envVars: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET", "AMADEUS_ENV"],
    },
    seatsAeroInfo(),
    {
      id: "google-places",
      name: "Google Places (experiences & maps)",
      category: "experiences",
      configured: Boolean(env("GOOGLE_PLACES_API_KEY")),
      dataKind: "live",
      docsUrl: "https://developers.google.com/maps/documentation/places/web-service",
      notes: "Adapter planned. Places content has display and caching restrictions — see docs/PROVIDERS.md.",
      envVars: ["GOOGLE_PLACES_API_KEY"],
    },
    {
      id: "unsplash",
      name: "Unsplash (destination photography)",
      category: "images",
      configured: Boolean(env("UNSPLASH_ACCESS_KEY")),
      dataKind: "live",
      docsUrl: "https://unsplash.com/documentation",
      notes: "Optional hero photography with required photographer attribution.",
      envVars: ["UNSPLASH_ACCESS_KEY"],
    },
    {
      id: "card-offers",
      name: "Card offers & benefits feed",
      category: "card_offers",
      configured: false,
      dataKind: "live",
      notes: "Issuers do not publish public APIs for Amex Offers or Chase Offers. PerkPilot uses a verified rules database maintained by admins and users.",
      envVars: [],
    },
    {
      id: "issuer-portals",
      name: "Amex Travel / Chase Travel",
      category: "hotels",
      configured: false,
      dataKind: "live",
      notes: "No public booking APIs are assumed. PerkPilot links out to the official portals for pricing and booking.",
      envVars: [],
    },
  ];
}

/** Live providers are opt-in and only used once configured; otherwise demo. */
export function getFlightProvider(): FlightProvider {
  if (duffelInfo().configured) return duffelFlightProvider;
  return demoFlightProvider;
}
export function getHotelProvider(): HotelProvider {
  return demoHotelProvider;
}
export function getExperienceProvider(): ExperienceProvider {
  return demoExperienceProvider;
}
