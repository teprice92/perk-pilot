import type { FlightOffer } from "@/lib/domain/types";
import { PROGRAMS } from "@/lib/rules/seed";
import { attachAwards } from "./awards";
import { buildExperiences, buildHotels, destinationById } from "./demo/destinations";
import { generateFlights, generateLeg } from "./demo/flights";
import { duffelFlightProvider, duffelInfo } from "./live/duffel";
import { googlePlacesInfo, googlePlacesProvider } from "./live/google-places";
import { roomsAeroInfo, roomsAeroProvider } from "./live/rooms-aero";
import { seatsAeroInfo, seatsAeroProvider } from "./live/seats-aero";
import { unsplashInfo } from "./live/unsplash";
import type { AwardProvider, ExperienceProvider, FlightProvider, HotelProvider, ProviderInfo } from "./types";
import type { HotelOffer } from "@/lib/domain/types";

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
    const dest = destinationById(params.destinationId ?? "");
    return generateFlights({ ...params, destinationId: dest?.id ?? "", bestMonths: dest?.bestMonths ?? [] });
  },
  async searchLeg(params) {
    return { offers: generateLeg(params), warnings: [] };
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

/* ───────────── Composition ───────────── */

/**
 * Wraps a cash-fare provider with an award-availability provider. Cached award
 * rows replace modelled estimates for matching programs; when the cash source
 * is live and no award provider is configured, live offers carry no awards.
 */
export function withAwards(cash: FlightProvider, awards: AwardProvider | null): FlightProvider {
  if (!awards) return cash;
  const enrich = async (offers: FlightOffer[], cabins: FlightOffer["cabin"][], warnings: string[]) => {
    const pairs = [...new Map(offers.map((o) => [`${o.origin}|${o.destination}|${o.date}`, o])).values()];
    const rows = (
      await Promise.all(
        pairs.map((o) =>
          awards.searchAwards({ origin: o.origin, destination: o.destination, date: o.date, cabins }).catch((e) => {
            warnings.push(`${awards.info().name}: ${o.origin}→${o.destination} failed (${e instanceof Error ? e.message : "error"})`);
            return [];
          }),
        ),
      )
    ).flat();
    return attachAwards(offers, rows, PROGRAMS);
  };
  return {
    info: () => ({ ...cash.info(), name: `${cash.info().name} + ${awards.info().name}` }),
    async searchFlights(params) {
      const res = await cash.searchFlights(params);
      const warnings = [...res.warnings];
      const [outbound, ret] = await Promise.all([enrich(res.outbound, params.cabins, warnings), enrich(res.return, params.cabins, warnings)]);
      return { ...res, outbound, return: ret, warnings };
    },
    searchLeg: cash.searchLeg
      ? async (params) => {
          const res = await cash.searchLeg!(params);
          const warnings = [...res.warnings];
          return { offers: await enrich(res.offers, params.cabins, warnings), warnings };
        }
      : undefined,
  };
}

/* ───────────── Selection (opt-in live providers) ───────────── */

export function getFlightProvider(): FlightProvider {
  const cash = duffelInfo().configured ? duffelFlightProvider : demoFlightProvider;
  return withAwards(cash, seatsAeroInfo().configured ? seatsAeroProvider : null);
}

/**
 * Adds real award-night hotels (cached) to a base hotel source. The demo
 * catalogue stays for card hotel programs (FHR / THC / The Edit), which award
 * sources don't cover; every offer keeps its own dataKind label.
 */
export function withHotelAwards(base: HotelProvider, awards: HotelProvider | null): HotelProvider {
  if (!awards) return base;
  return {
    info: () => ({ ...base.info(), name: `${base.info().name} + ${awards.info().name}` }),
    async searchHotels(params) {
      const [b, a] = await Promise.all([
        base.searchHotels(params),
        awards.searchHotels(params).catch((e): HotelOffer[] => {
          console.error(`[perkpilot] ${awards.info().name} failed`, e instanceof Error ? e.message : e);
          return [];
        }),
      ]);
      return [...a, ...b];
    },
  };
}

export function getHotelProvider(): HotelProvider {
  // No live cash-rate hotel provider (Amadeus Self-Service was retired in 2026);
  // Rooms.aero adds real award nights when enabled.
  return withHotelAwards(demoHotelProvider, roomsAeroInfo().configured ? roomsAeroProvider : null);
}

export function getExperienceProvider(): ExperienceProvider {
  return googlePlacesInfo().configured ? googlePlacesProvider : demoExperienceProvider;
}

export function providerCatalogue(): ProviderInfo[] {
  return [
    demoFlightProvider.info(),
    demoHotelProvider.info(),
    demoExperienceProvider.info(),
    duffelInfo(),
    seatsAeroInfo(),
    roomsAeroInfo(),
    googlePlacesInfo(),
    unsplashInfo(),
    {
      id: "card-offers",
      name: "Card offers & benefits feed",
      category: "card_offers",
      configured: false,
      dataKind: "live",
      notes: "Issuers do not publish public APIs for Amex Offers or Chase Offers. Benefits are maintained in the verified rules database (admin verification API).",
      envVars: ["PERKPILOT_ADMIN_TOKEN"],
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
