import type { BenefitUsage, Household, TravelPreferences } from "@/lib/domain/types";

/** Clearly labelled demo household used by guest mode. Names are fictional. */

export const DEFAULT_PREFERENCES: TravelPreferences = {
  cabin: "business",
  maxStops: 1,
  hotelTier: "luxury",
  styles: ["food", "romantic", "culture"],
  pace: "balanced",
  preferRefundable: true,
  comfort: {
    premiumEconomyPerHourCents: 800,
    businessPerHourCents: 3000,
    firstPerHourCents: 4500,
    luxuryHotelPerNightCents: 6000,
    stopPenaltyCents: 4000,
    hourPenaltyCents: 1500,
  },
};

export const DEFAULT_VALUATIONS: Record<string, number> = {
  "amex-mr": 1.6,
  "chase-ur": 1.6,
  united: 1.25,
  aeroplan: 1.4,
  "avios-ba": 1.3,
  flyingblue: 1.25,
  virgin: 1.35,
  hyatt: 1.8,
  marriott: 0.75,
  hilton: 0.45,
  ihg: 0.55,
  delta: 1.1,
};

const now = "2026-10-28T12:00:00.000Z";

export function demoHousehold(): Household {
  return {
    id: "demo-household",
    name: "The Rivera-Chen household (demo)",
    mode: "demo",
    homeAirport: "SFO",
    preferences: DEFAULT_PREFERENCES,
    valuations: { ...DEFAULT_VALUATIONS },
    minRedemptionCpp: 1.5,
    cashBudgetCents: 900_000,
    travelers: [
      {
        id: "t-alex",
        name: "Alex",
        initials: "AR",
        color: "#2c7a7b",
        homeAirport: "SFO",
        cards: [
          { cardId: "amex-platinum", role: "primary", openedDate: "2021-03-14" },
        ],
        balances: [
          { programId: "amex-mr", points: 186_400, updatedAt: now },
          { programId: "united", points: 22_300, updatedAt: now },
          { programId: "marriott", points: 41_000, updatedAt: now },
        ],
        loyalty: [
          { programId: "united", memberLast4: "4821", eliteStatus: "Premier Silver" },
          { programId: "marriott", memberLast4: "0193", eliteStatus: "Gold Elite (card)" },
          { programId: "hilton", memberLast4: "7710", eliteStatus: "Gold (card)" },
        ],
      },
      {
        id: "t-jordan",
        name: "Jordan",
        initials: "JC",
        color: "#b7791f",
        homeAirport: "SFO",
        cards: [
          { cardId: "chase-sapphire-reserve", role: "primary", openedDate: "2023-08-02" },
          { cardId: "amex-platinum", role: "authorized_user", primaryTravelerId: "t-alex" },
        ],
        balances: [
          { programId: "chase-ur", points: 148_900, updatedAt: now },
          { programId: "hyatt", points: 18_500, updatedAt: now },
        ],
        loyalty: [
          { programId: "hyatt", memberLast4: "5532", eliteStatus: "Explorist" },
          { programId: "aeroplan", memberLast4: "3307" },
        ],
      },
    ],
  };
}

export function demoUsage(): BenefitUsage[] {
  const at = now;
  return [
    { benefitId: "amex-plat-airline-fee", travelerId: "t-alex", periodKey: "2026", usedCents: 6500, enrolled: true, updatedAt: at, notes: "Selected airline: United (demo)" },
    { benefitId: "amex-plat-resy", travelerId: "t-alex", periodKey: "2026-Q4", usedCents: 0, enrolled: true, updatedAt: at },
    { benefitId: "amex-plat-hotel-credit-2025", travelerId: "t-alex", periodKey: "2026-H2", usedCents: 0, enrolled: true, updatedAt: at },
    { benefitId: "amex-plat-lounges", travelerId: "t-alex", periodKey: "ongoing", usedCents: 0, enrolled: true, updatedAt: at },
    { benefitId: "csr-travel-credit", travelerId: "t-jordan", periodKey: "CY2026", usedCents: 11_800, enrolled: true, updatedAt: at },
    { benefitId: "csr-edit-credit", travelerId: "t-jordan", periodKey: "2026-H2", usedCents: 0, enrolled: true, updatedAt: at },
    { benefitId: "csr-stubhub", travelerId: "t-jordan", periodKey: "2026-H2", usedCents: 0, enrolled: false, updatedAt: at },
    { benefitId: "csr-dining", travelerId: "t-jordan", periodKey: "2026-H2", usedCents: 4_000, enrolled: true, updatedAt: at },
    { benefitId: "csr-lounges", travelerId: "t-jordan", periodKey: "ongoing", usedCents: 0, enrolled: true, updatedAt: at },
  ];
}

/** An empty household for personal mode — users fill it in. */
export function blankHousehold(): Household {
  return {
    id: "household",
    name: "Our household",
    mode: "personal",
    homeAirport: "SFO",
    preferences: DEFAULT_PREFERENCES,
    valuations: { ...DEFAULT_VALUATIONS },
    minRedemptionCpp: 1.5,
    cashBudgetCents: 0,
    travelers: [
      { id: "t-1", name: "Traveler 1", initials: "T1", color: "#2c7a7b", homeAirport: "SFO", cards: [], balances: [], loyalty: [] },
      { id: "t-2", name: "Traveler 2", initials: "T2", color: "#b7791f", homeAirport: "SFO", cards: [], balances: [], loyalty: [] },
    ],
  };
}
