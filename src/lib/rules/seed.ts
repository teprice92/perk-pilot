import type {
  Benefit,
  Card,
  PortalRate,
  RewardsProgram,
  RulesDataset,
  TransferBonus,
  TransferPartner,
} from "@/lib/domain/types";

/**
 * PerkPilot starter rules dataset.
 *
 * IMPORTANT: Card benefits, transfer ratios and portal rates change often.
 * Everything here is seeded as `unverified` (or `demo` for sample promotions)
 * with `lastVerified: null`. The UI surfaces this status everywhere and asks
 * users to verify against the linked official source. Values live in data —
 * never in calculation code — and every entry is date-effective so changes can
 * be recorded by adding a new row with a new `effectiveFrom` instead of editing
 * history. In production, these rows live in Postgres (see prisma/schema.prisma)
 * and are maintained by an admin verification workflow.
 */

const SEED_NOTE = "Starter dataset — confirm at the official source before relying on it.";

export const AMEX_PLAT_URL = "https://www.americanexpress.com/us/credit-cards/card/platinum/";
export const AMEX_MR_TRANSFER_URL = "https://global.americanexpress.com/rewards/transfer";
const AMEX_FHR_URL = "https://www.americanexpress.com/en-us/travel/fine-hotels-resorts/";
const AMEX_THC_URL = "https://www.americanexpress.com/en-us/travel/the-hotel-collection/";
export const CSR_URL = "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve";
export const CHASE_UR_URL = "https://www.chase.com/personal/credit-cards/ultimate-rewards";
const CHASE_TRAVEL_URL = "https://www.chase.com/travel";

const u = (sourceUrl: string, notes = SEED_NOTE) => ({
  verification: "unverified" as const,
  sourceUrl,
  lastVerified: null,
  notes,
});

/* ───────────────────────────── Programs ───────────────────────────── */

const STAR = ["UA", "NH", "AC", "LH", "SQ", "TK", "LX", "OS", "NZ", "TP"];
const ONEWORLD = ["AA", "BA", "IB", "JL", "QR", "CX", "AS", "QF", "AY", "HA"];
const SKYTEAM = ["DL", "AF", "KL", "AM", "KE"];

const unknownPooling = (url?: string) => ({
  householdTransfer: "unknown" as const,
  description: "Household pooling rules not yet modelled — check the program's terms.",
  ...u(url ?? ""),
});

export const PROGRAMS: RewardsProgram[] = [
  {
    id: "amex-mr",
    name: "American Express Membership Rewards",
    shortName: "Amex MR",
    kind: "bank",
    currency: "points",
    canBookForOthers: true,
    pooling: {
      householdTransfer: "not_allowed",
      description:
        "Membership Rewards points cannot be moved into another person's Membership Rewards account. Points may be transferred to an authorized user's eligible airline/hotel account in some programs after the AU has been on the account for a period.",
      conditions: [
        "Recipient loyalty account must be in the Basic Card Member's name or an eligible authorized user's name",
        "Authorized-user tenure requirements may apply",
      ],
      ...u(AMEX_MR_TRANSFER_URL),
    },
    ...u(AMEX_MR_TRANSFER_URL),
  },
  {
    id: "chase-ur",
    name: "Chase Ultimate Rewards",
    shortName: "Chase UR",
    kind: "bank",
    currency: "points",
    canBookForOthers: true,
    pooling: {
      householdTransfer: "allowed",
      maxMembers: 1,
      description:
        "Ultimate Rewards points can be combined with one member of your household who also has an Ultimate Rewards card.",
      conditions: ["Recipient must be a household member", "Limited to one household member"],
      ...u(CHASE_UR_URL),
    },
    ...u(CHASE_UR_URL),
  },
  // Airlines
  { id: "united", name: "United MileagePlus", shortName: "United", kind: "airline", currency: "miles", alliance: "star", bookableCarriers: STAR, canBookForOthers: true, awardSearchUrl: "https://www.united.com/en/us/book-flight/united-awards", pooling: unknownPooling("https://www.united.com/en/us/fly/mileageplus.html"), ...u("https://www.united.com/en/us/fly/mileageplus.html") },
  { id: "aeroplan", name: "Air Canada Aeroplan", shortName: "Aeroplan", kind: "airline", currency: "points", alliance: "star", bookableCarriers: [...STAR, "EY"], canBookForOthers: true, awardSearchUrl: "https://www.aircanada.com/aeroplan/redeem", pooling: { householdTransfer: "allowed", maxMembers: 7, description: "Aeroplan Family Sharing lets up to eight members pool points.", ...u("https://www.aircanada.com/ca/en/aco/home/aeroplan/family-sharing.html") }, ...u("https://www.aircanada.com/aeroplan") },
  { id: "ana", name: "ANA Mileage Club", shortName: "ANA", kind: "airline", currency: "miles", alliance: "star", bookableCarriers: STAR, canBookForOthers: true, awardSearchUrl: "https://www.ana.co.jp/en/us/amc/", pooling: unknownPooling(), ...u("https://www.ana.co.jp/en/us/amc/") },
  { id: "singapore", name: "Singapore KrisFlyer", shortName: "KrisFlyer", kind: "airline", currency: "miles", alliance: "star", bookableCarriers: ["SQ", "UA", "NH", "AC", "LH"], canBookForOthers: true, awardSearchUrl: "https://www.singaporeair.com/en_UK/us/ppsclub-krisflyer/", pooling: unknownPooling(), ...u("https://www.singaporeair.com/en_UK/us/ppsclub-krisflyer/") },
  { id: "avianca", name: "Avianca LifeMiles", shortName: "LifeMiles", kind: "airline", currency: "miles", alliance: "star", bookableCarriers: STAR, canBookForOthers: true, awardSearchUrl: "https://www.lifemiles.com", pooling: unknownPooling(), ...u("https://www.lifemiles.com") },
  { id: "flyingblue", name: "Air France-KLM Flying Blue", shortName: "Flying Blue", kind: "airline", currency: "miles", alliance: "skyteam", bookableCarriers: [...SKYTEAM, "VS"], canBookForOthers: true, awardSearchUrl: "https://wwws.airfrance.us/search/advanced?bookingFlow=REWARD", pooling: { householdTransfer: "conditional", description: "Flying Blue Family/household pooling may be available with conditions.", ...u("https://www.flyingblue.com") }, ...u("https://www.flyingblue.com") },
  { id: "virgin", name: "Virgin Atlantic Flying Club", shortName: "Virgin", kind: "airline", currency: "points", alliance: null, bookableCarriers: ["VS", "DL", "AF", "KL", "NH"], canBookForOthers: true, awardSearchUrl: "https://www.virginatlantic.com/flying-club", pooling: { householdTransfer: "conditional", description: "Household pooling available for some members — verify terms.", ...u("https://www.virginatlantic.com/flying-club") }, ...u("https://www.virginatlantic.com/flying-club") },
  { id: "delta", name: "Delta SkyMiles", shortName: "Delta", kind: "airline", currency: "miles", alliance: "skyteam", bookableCarriers: [...SKYTEAM, "VS"], canBookForOthers: true, awardSearchUrl: "https://www.delta.com/flight-search/book-a-flight", pooling: unknownPooling(), ...u("https://www.delta.com/skymiles") },
  { id: "avios-ba", name: "British Airways Club (Avios)", shortName: "BA Avios", kind: "airline", currency: "Avios", alliance: "oneworld", bookableCarriers: [...ONEWORLD, "EI"], canBookForOthers: true, awardSearchUrl: "https://www.britishairways.com/travel/redeem/execclub/", pooling: { householdTransfer: "allowed", maxMembers: 6, description: "Household Account lets up to seven people at the same address pool Avios.", ...u("https://www.britishairways.com") }, ...u("https://www.britishairways.com") },
  { id: "iberia", name: "Iberia Club (Avios)", shortName: "Iberia", kind: "airline", currency: "Avios", alliance: "oneworld", bookableCarriers: ["IB", "BA", "AA", "AY", "QR"], canBookForOthers: true, awardSearchUrl: "https://www.iberia.com/us/iberiaplus/", pooling: unknownPooling(), ...u("https://www.iberia.com") },
  { id: "aerlingus", name: "Aer Lingus AerClub (Avios)", shortName: "AerClub", kind: "airline", currency: "Avios", alliance: null, bookableCarriers: ["EI", "BA", "AA", "IB"], canBookForOthers: true, awardSearchUrl: "https://www.aerlingus.com/aerclub/", pooling: unknownPooling(), ...u("https://www.aerlingus.com/aerclub/") },
  { id: "qatar", name: "Qatar Airways Privilege Club (Avios)", shortName: "Qatar", kind: "airline", currency: "Avios", alliance: "oneworld", bookableCarriers: ["QR", "BA", "AA", "JL", "CX", "IB"], canBookForOthers: true, awardSearchUrl: "https://www.qatarairways.com/en-us/privilege-club.html", pooling: unknownPooling(), ...u("https://www.qatarairways.com") },
  { id: "cathay", name: "Cathay Asia Miles", shortName: "Asia Miles", kind: "airline", currency: "miles", alliance: "oneworld", bookableCarriers: ["CX", "AA", "BA", "JL", "QR", "AS"], canBookForOthers: true, awardSearchUrl: "https://www.cathaypacific.com/cx/en_US/membership.html", pooling: unknownPooling(), ...u("https://www.cathaypacific.com") },
  { id: "qantas", name: "Qantas Frequent Flyer", shortName: "Qantas", kind: "airline", currency: "points", alliance: "oneworld", bookableCarriers: ["QF", "AA", "BA", "JL"], canBookForOthers: true, awardSearchUrl: "https://www.qantas.com/us/en/frequent-flyer.html", pooling: unknownPooling(), ...u("https://www.qantas.com") },
  { id: "emirates", name: "Emirates Skywards", shortName: "Skywards", kind: "airline", currency: "miles", alliance: null, bookableCarriers: ["EK", "QF"], canBookForOthers: true, awardSearchUrl: "https://www.emirates.com/us/english/skywards/", pooling: unknownPooling(), ...u("https://www.emirates.com") },
  { id: "jetblue", name: "JetBlue TrueBlue", shortName: "TrueBlue", kind: "airline", currency: "points", alliance: null, bookableCarriers: ["B6"], canBookForOthers: true, awardSearchUrl: "https://www.jetblue.com/trueblue", pooling: { householdTransfer: "allowed", description: "Points Pooling lets families combine TrueBlue points.", ...u("https://www.jetblue.com/trueblue") }, ...u("https://www.jetblue.com/trueblue") },
  { id: "southwest", name: "Southwest Rapid Rewards", shortName: "Southwest", kind: "airline", currency: "points", alliance: null, bookableCarriers: ["WN"], canBookForOthers: true, awardSearchUrl: "https://www.southwest.com", pooling: unknownPooling(), ...u("https://www.southwest.com/rapidrewards/") },
  // Hotels
  { id: "hyatt", name: "World of Hyatt", shortName: "Hyatt", kind: "hotel", currency: "points", hotelChain: "Hyatt", canBookForOthers: true, awardSearchUrl: "https://world.hyatt.com", pooling: unknownPooling("https://world.hyatt.com"), ...u("https://world.hyatt.com") },
  { id: "marriott", name: "Marriott Bonvoy", shortName: "Bonvoy", kind: "hotel", currency: "points", hotelChain: "Marriott", canBookForOthers: true, awardSearchUrl: "https://www.marriott.com/loyalty/redeem.mi", pooling: { householdTransfer: "conditional", description: "Members may transfer a limited number of points to another member per year.", ...u("https://www.marriott.com/loyalty.mi") }, ...u("https://www.marriott.com/loyalty.mi") },
  { id: "hilton", name: "Hilton Honors", shortName: "Hilton", kind: "hotel", currency: "points", hotelChain: "Hilton", canBookForOthers: true, awardSearchUrl: "https://www.hilton.com/en/hilton-honors/", pooling: { householdTransfer: "allowed", description: "Points Pooling allows combining points with other members.", ...u("https://www.hilton.com/en/hilton-honors/") }, ...u("https://www.hilton.com/en/hilton-honors/") },
  { id: "ihg", name: "IHG One Rewards", shortName: "IHG", kind: "hotel", currency: "points", hotelChain: "IHG", canBookForOthers: true, awardSearchUrl: "https://www.ihg.com/onerewards", pooling: unknownPooling(), ...u("https://www.ihg.com/onerewards") },
  { id: "choice", name: "Choice Privileges", shortName: "Choice", kind: "hotel", currency: "points", hotelChain: "Choice", canBookForOthers: true, pooling: unknownPooling(), ...u("https://www.choicehotels.com/choice-privileges") },
];

/* ───────────────────────────── Cards ───────────────────────────── */

export const CARDS: Card[] = [
  {
    id: "amex-platinum",
    name: "The Platinum Card® from American Express",
    issuer: "American Express",
    programId: "amex-mr",
    network: "American Express",
    annualFee: { amountCents: 89500, effectiveFrom: "2025-09-18", ...u(AMEX_PLAT_URL) },
    earnRules: [
      { category: "flights_direct", multiplier: 5, annualCapCents: 50_000_000, description: "Flights booked directly with airlines or with Amex Travel", effectiveFrom: "2020-01-01", ...u(AMEX_PLAT_URL) },
      { category: "portal_flights", multiplier: 5, annualCapCents: 50_000_000, description: "Flights booked with Amex Travel", effectiveFrom: "2020-01-01", ...u(AMEX_PLAT_URL) },
      { category: "portal_hotels", multiplier: 5, description: "Prepaid hotels booked with Amex Travel", effectiveFrom: "2020-01-01", ...u(AMEX_PLAT_URL) },
      { category: "other", multiplier: 1, description: "Other eligible purchases", effectiveFrom: "2020-01-01", ...u(AMEX_PLAT_URL) },
    ],
    art: { from: "#cfd3d8", to: "#8d949c", text: "#1a1f29" },
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "chase-sapphire-reserve",
    name: "Chase Sapphire Reserve®",
    issuer: "Chase",
    programId: "chase-ur",
    network: "Visa",
    annualFee: { amountCents: 79500, effectiveFrom: "2025-06-23", ...u(CSR_URL) },
    earnRules: [
      { category: "portal_flights", multiplier: 8, description: "Purchases through Chase Travel", effectiveFrom: "2025-06-23", ...u(CSR_URL) },
      { category: "portal_hotels", multiplier: 8, description: "Purchases through Chase Travel", effectiveFrom: "2025-06-23", ...u(CSR_URL) },
      { category: "flights_direct", multiplier: 4, description: "Flights booked directly with airlines", effectiveFrom: "2025-06-23", ...u(CSR_URL) },
      { category: "hotels_direct", multiplier: 4, description: "Hotels booked directly", effectiveFrom: "2025-06-23", ...u(CSR_URL) },
      { category: "dining", multiplier: 3, description: "Dining worldwide", effectiveFrom: "2025-06-23", ...u(CSR_URL) },
      { category: "other_travel", multiplier: 1, description: "Other travel", effectiveFrom: "2025-06-23", ...u(CSR_URL) },
      { category: "other", multiplier: 1, description: "Other purchases", effectiveFrom: "2025-06-23", ...u(CSR_URL) },
    ],
    art: { from: "#22314f", to: "#0b1220", text: "#e9e4d8" },
    ...u(CSR_URL),
  },
];

/* ───────────────────────────── Benefits ───────────────────────────── */

const FHR_PERKS = [
  { name: "Daily breakfast for two", kind: "guaranteed" as const, valuation: { type: "breakfast_per_night" as const, perPersonCents: 3000 } },
  { name: "$100 experience credit (varies by property)", kind: "guaranteed" as const, valuation: { type: "fixed_per_stay" as const, cents: 10000 }, usefulness: 0.75 },
  { name: "Guaranteed 4pm late checkout", kind: "guaranteed" as const, valuation: { type: "none" as const } },
  { name: "Room upgrade upon arrival", kind: "when_available" as const },
  { name: "Noon check-in", kind: "when_available" as const },
  { name: "Complimentary Wi-Fi", kind: "guaranteed" as const, valuation: { type: "none" as const } },
];

const THC_PERKS = [
  { name: "$100 hotel credit for dining, spa or resort activities", kind: "guaranteed" as const, valuation: { type: "fixed_per_stay" as const, cents: 10000 }, usefulness: 0.75 },
  { name: "Room upgrade at check-in", kind: "when_available" as const },
  { name: "Early check-in / late checkout", kind: "when_available" as const },
];

const EDIT_PERKS = [
  { name: "Daily breakfast for two", kind: "guaranteed" as const, valuation: { type: "breakfast_per_night" as const, perPersonCents: 3000 } },
  { name: "$100 property credit", kind: "guaranteed" as const, valuation: { type: "fixed_per_stay" as const, cents: 10000 }, usefulness: 0.75 },
  { name: "Room upgrade", kind: "when_available" as const },
  { name: "Early check-in / late checkout", kind: "when_available" as const },
  { name: "Complimentary Wi-Fi", kind: "guaranteed" as const, valuation: { type: "none" as const } },
];

export const BENEFITS: Benefit[] = [
  // ── Amex Platinum ──
  {
    id: "amex-plat-fhr",
    cardId: "amex-platinum",
    name: "Fine Hotels + Resorts®",
    description: "Elevated benefits at participating luxury properties when booked through Amex Travel.",
    category: "hotel_program",
    period: "per_stay",
    eligibility: ["Platinum Card Member must book through Amex Travel", "Card Member must be on the reservation"],
    enrollmentRequired: false,
    bookingChannel: "amex_fhr",
    appliesTo: ["hotel"],
    eligibleTags: ["fhr"],
    limitations: ["Benefits vary by property", "Upgrades and early check-in subject to availability"],
    perks: FHR_PERKS,
    effectiveFrom: "2020-01-01",
    ...u(AMEX_FHR_URL),
  },
  {
    id: "amex-plat-thc",
    cardId: "amex-platinum",
    name: "The Hotel Collection",
    description: "Perks at participating upscale hotels booked through Amex Travel; two-night minimum stay.",
    category: "hotel_program",
    period: "per_stay",
    eligibility: ["Book through Amex Travel", "Minimum two consecutive nights"],
    enrollmentRequired: false,
    bookingChannel: "amex_thc",
    appliesTo: ["hotel"],
    eligibleTags: ["thc"],
    minNights: 2,
    limitations: ["Credit usage rules vary by property"],
    perks: THC_PERKS,
    effectiveFrom: "2020-01-01",
    ...u(AMEX_THC_URL),
  },
  {
    id: "amex-plat-hotel-credit-2025",
    cardId: "amex-platinum",
    name: "Hotel credit (FHR / THC prepaid)",
    description: "Statement credit on prepaid Fine Hotels + Resorts or The Hotel Collection bookings made through Amex Travel.",
    category: "hotel_credit",
    amountCents: 30000,
    period: "semiannual",
    eligibility: ["Prepaid FHR or THC booking through Amex Travel", "THC requires a two-night minimum"],
    enrollmentRequired: false,
    bookingChannel: "amex_travel",
    appliesTo: ["hotel"],
    eligibleTags: ["fhr", "thc"],
    prepaidRequired: true,
    limitations: ["Up to the stated amount each half of the calendar year (Jan–Jun, Jul–Dec)", "Based on charge date, not stay date"],
    renewal: "Resets January 1 and July 1",
    effectiveFrom: "2025-09-18",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-hotel-credit-legacy",
    cardId: "amex-platinum",
    name: "Hotel credit (legacy)",
    description: "Prior annual hotel credit on prepaid FHR/THC bookings — kept for date-effective history.",
    category: "hotel_credit",
    amountCents: 20000,
    period: "calendar_year",
    eligibility: ["Prepaid FHR or THC booking through Amex Travel"],
    enrollmentRequired: false,
    bookingChannel: "amex_travel",
    appliesTo: ["hotel"],
    eligibleTags: ["fhr", "thc"],
    prepaidRequired: true,
    limitations: ["Superseded"],
    effectiveFrom: "2021-07-01",
    effectiveTo: "2025-09-17",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-airline-fee",
    cardId: "amex-platinum",
    name: "Airline fee credit",
    description: "Statement credits for incidental fees (e.g. checked bags, seat fees) charged by one selected airline.",
    category: "airline_credit",
    amountCents: 20000,
    period: "calendar_year",
    eligibility: ["Select one qualifying airline", "Incidental fees only — not airfare"],
    enrollmentRequired: true,
    bookingChannel: "direct",
    appliesTo: ["flight"],
    eligibleTags: ["airline_incidentals"],
    limitations: ["Airline tickets, upgrades and gift cards generally do not qualify"],
    renewal: "Calendar year",
    effectiveFrom: "2020-01-01",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-resy",
    cardId: "amex-platinum",
    name: "Resy dining credit",
    description: "Statement credits for purchases at eligible U.S. Resy restaurants.",
    category: "dining_credit",
    amountCents: 10000,
    period: "quarterly",
    eligibility: ["Eligible U.S. restaurants on Resy", "Pay with the Platinum Card"],
    enrollmentRequired: true,
    bookingChannel: "resy",
    appliesTo: ["dining"],
    eligibleTags: ["resy"],
    limitations: ["U.S. restaurants only", "Unused quarterly balance does not roll over"],
    renewal: "Quarterly",
    effectiveFrom: "2025-09-18",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-clear",
    cardId: "amex-platinum",
    name: "CLEAR® Plus credit",
    description: "Statement credit toward a CLEAR Plus membership.",
    category: "trusted_traveler",
    amountCents: 20900,
    period: "calendar_year",
    eligibility: ["Pay for CLEAR Plus with the card"],
    enrollmentRequired: false,
    appliesTo: [],
    limitations: ["Amount reflects membership price — verify current figure"],
    effectiveFrom: "2025-01-01",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-global-entry",
    cardId: "amex-platinum",
    name: "Global Entry or TSA PreCheck® credit",
    description: "Statement credit for a Global Entry or TSA PreCheck application fee.",
    category: "trusted_traveler",
    amountCents: 12000,
    period: "every_4_years",
    eligibility: ["Pay the application fee with the card"],
    enrollmentRequired: false,
    appliesTo: [],
    limitations: ["Global Entry every 4 years or TSA PreCheck every 4.5 years"],
    effectiveFrom: "2020-01-01",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-lounges",
    cardId: "amex-platinum",
    name: "Global Lounge Collection",
    description: "Access to Centurion Lounges, Priority Pass Select (enrollment required), Delta Sky Club when flying Delta (visit limits apply) and other partner lounges.",
    category: "lounge",
    period: "ongoing",
    eligibility: ["Same-day boarding pass", "Guest policies vary by lounge"],
    enrollmentRequired: true,
    appliesTo: ["flight"],
    limitations: ["Guest access fees and visit caps may apply"],
    appliesToAuthorizedUsers: true,
    effectiveFrom: "2020-01-01",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-hotel-status",
    cardId: "amex-platinum",
    name: "Hotel elite status (Marriott Bonvoy Gold, Hilton Honors Gold)",
    description: "Complimentary hotel elite status after enrollment.",
    category: "elite_status",
    period: "ongoing",
    eligibility: ["Enrollment required"],
    enrollmentRequired: true,
    appliesTo: ["hotel"],
    limitations: ["Elite benefits vary by brand and property"],
    effectiveFrom: "2020-01-01",
    ...u(AMEX_PLAT_URL),
  },
  {
    id: "amex-plat-trip-delay",
    cardId: "amex-platinum",
    name: "Trip delay & cancellation insurance",
    description: "Coverage when a covered trip is delayed or cancelled for a covered reason, when paid with the card.",
    category: "insurance",
    period: "ongoing",
    eligibility: ["Round-trip fare paid with the eligible card", "Terms, exclusions and limits apply"],
    enrollmentRequired: false,
    appliesTo: ["flight"],
    limitations: ["Underwritten by a third party — read the guide to benefits"],
    effectiveFrom: "2020-01-01",
    ...u(AMEX_PLAT_URL),
  },

  // ── Chase Sapphire Reserve ──
  {
    id: "csr-travel-credit",
    cardId: "chase-sapphire-reserve",
    name: "Annual travel credit",
    description: "Automatic statement credits for travel purchases charged to the card.",
    category: "travel_credit",
    amountCents: 30000,
    period: "cardmember_year",
    eligibility: ["Purchases coding as travel"],
    enrollmentRequired: false,
    bookingChannel: "any",
    appliesTo: ["flight", "hotel", "experience"],
    eligibleTags: ["travel"],
    limitations: ["Points are not earned on purchases reimbursed by the credit"],
    renewal: "Each cardmember year",
    effectiveFrom: "2017-01-01",
    ...u(CSR_URL),
  },
  {
    id: "csr-the-edit",
    cardId: "chase-sapphire-reserve",
    name: "The Edit by Chase Travel",
    description: "Luxury hotel collection with on-property benefits when booked via Chase Travel.",
    category: "hotel_program",
    period: "per_stay",
    eligibility: ["Book through Chase Travel with a Sapphire Reserve card"],
    enrollmentRequired: false,
    bookingChannel: "chase_edit",
    appliesTo: ["hotel"],
    eligibleTags: ["the_edit"],
    limitations: ["Benefits vary by property; upgrades subject to availability"],
    perks: EDIT_PERKS,
    effectiveFrom: "2024-06-01",
    ...u(CHASE_TRAVEL_URL),
  },
  {
    id: "csr-edit-credit",
    cardId: "chase-sapphire-reserve",
    name: "The Edit hotel credit",
    description: "Statement credit on prepaid bookings with The Edit through Chase Travel (two-night minimum).",
    category: "hotel_credit",
    amountCents: 25000,
    period: "semiannual",
    eligibility: ["Prepaid The Edit booking", "Two-night minimum"],
    enrollmentRequired: false,
    bookingChannel: "chase_edit",
    appliesTo: ["hotel"],
    eligibleTags: ["the_edit"],
    minNights: 2,
    prepaidRequired: true,
    limitations: ["Up to the stated amount Jan–Jun and Jul–Dec"],
    renewal: "Resets January 1 and July 1",
    effectiveFrom: "2025-06-23",
    ...u(CSR_URL),
  },
  {
    id: "csr-select-hotels-2026",
    cardId: "chase-sapphire-reserve",
    name: "Select hotel brands credit (2026)",
    description: "One-time credit for prepaid stays of two nights or more at select participating brands booked through Chase Travel.",
    category: "hotel_credit",
    amountCents: 25000,
    period: "calendar_year",
    eligibility: ["Participating brands only", "Two-night minimum", "Prepaid via Chase Travel"],
    enrollmentRequired: false,
    bookingChannel: "chase_travel",
    appliesTo: ["hotel"],
    eligibleTags: ["chase_select_brand"],
    minNights: 2,
    prepaidRequired: true,
    limitations: ["Calendar-year 2026 only"],
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    ...u(CSR_URL),
  },
  {
    id: "csr-dining",
    cardId: "chase-sapphire-reserve",
    name: "Sapphire Reserve Exclusive Tables dining credit",
    description: "Statement credits at restaurants in the Sapphire Reserve Exclusive Tables program on OpenTable.",
    category: "dining_credit",
    amountCents: 15000,
    period: "semiannual",
    eligibility: ["Participating restaurants only"],
    enrollmentRequired: false,
    bookingChannel: "opentable",
    appliesTo: ["dining"],
    eligibleTags: ["sapphire_tables"],
    limitations: ["Participating restaurants list changes"],
    effectiveFrom: "2025-06-23",
    ...u(CSR_URL),
  },
  {
    id: "csr-stubhub",
    cardId: "chase-sapphire-reserve",
    name: "StubHub / viagogo credit",
    description: "Statement credits on concert and event tickets purchased through StubHub or viagogo.",
    category: "entertainment_credit",
    amountCents: 15000,
    period: "semiannual",
    eligibility: ["Activation required", "Purchases through StubHub or viagogo"],
    enrollmentRequired: true,
    bookingChannel: "stubhub",
    appliesTo: ["experience"],
    eligibleTags: ["stubhub"],
    limitations: ["Activation required before purchase"],
    effectiveFrom: "2025-06-23",
    ...u(CSR_URL),
  },
  {
    id: "csr-global-entry",
    cardId: "chase-sapphire-reserve",
    name: "Global Entry, TSA PreCheck® or NEXUS credit",
    description: "Statement credit for an application fee.",
    category: "trusted_traveler",
    amountCents: 12000,
    period: "every_4_years",
    eligibility: ["Pay the application fee with the card"],
    enrollmentRequired: false,
    appliesTo: [],
    limitations: ["Once every four years"],
    effectiveFrom: "2017-01-01",
    ...u(CSR_URL),
  },
  {
    id: "csr-lounges",
    cardId: "chase-sapphire-reserve",
    name: "Priority Pass Select & Chase Sapphire Lounges",
    description: "Airport lounge access including Chase Sapphire Lounge by The Club locations.",
    category: "lounge",
    period: "ongoing",
    eligibility: ["Priority Pass enrollment required", "Guest policies apply"],
    enrollmentRequired: true,
    appliesTo: ["flight"],
    limitations: ["Guest limits may apply"],
    appliesToAuthorizedUsers: true,
    effectiveFrom: "2017-01-01",
    ...u(CSR_URL),
  },
  {
    id: "csr-trip-protection",
    cardId: "chase-sapphire-reserve",
    name: "Trip cancellation, delay & primary rental car coverage",
    description: "Travel protections when the trip is paid with the card or its points.",
    category: "insurance",
    period: "ongoing",
    eligibility: ["Pay for the common carrier fare with the card or Ultimate Rewards points"],
    enrollmentRequired: false,
    appliesTo: ["flight", "hotel"],
    limitations: ["Terms, exclusions and limits apply — read the guide to benefits"],
    effectiveFrom: "2017-01-01",
    ...u(CSR_URL),
  },
  {
    id: "csr-ihg-status",
    cardId: "chase-sapphire-reserve",
    name: "IHG One Rewards Platinum Elite",
    description: "Complimentary IHG elite status after enrollment.",
    category: "elite_status",
    period: "ongoing",
    eligibility: ["Enrollment required"],
    enrollmentRequired: true,
    appliesTo: ["hotel"],
    limitations: ["Time-limited offer — check end date"],
    effectiveFrom: "2025-06-23",
    ...u(CSR_URL),
  },
];

/* ─────────────────────────── Transfer partners ─────────────────────────── */

type TP = [to: string, ratioFrom: number, ratioTo: number, increment?: number, time?: string];

const AMEX_PARTNERS: TP[] = [
  ["aeroplan", 1, 1], ["ana", 1, 1, 1000, "Up to 2 days"], ["avianca", 1, 1], ["avios-ba", 1, 1],
  ["cathay", 1, 1], ["delta", 1, 1], ["emirates", 1000, 800], ["flyingblue", 1, 1],
  ["iberia", 1, 1], ["aerlingus", 1, 1], ["jetblue", 250, 200, 250], ["qantas", 1, 1],
  ["qatar", 1, 1], ["singapore", 1, 1], ["virgin", 1, 1],
  ["hilton", 1, 2], ["marriott", 1, 1, 1000, "Up to 2 days"], ["choice", 1, 1],
];

const CHASE_PARTNERS: TP[] = [
  ["aerlingus", 1, 1], ["aeroplan", 1, 1], ["avios-ba", 1, 1], ["emirates", 1, 1], ["flyingblue", 1, 1],
  ["iberia", 1, 1], ["jetblue", 1, 1], ["singapore", 1, 1, 1000, "Up to 2 days"], ["southwest", 1, 1],
  ["united", 1, 1], ["virgin", 1, 1], ["hyatt", 1, 1], ["ihg", 1, 1], ["marriott", 1, 1, 1000, "Up to 2 days"],
];

function buildPartners(from: string, list: TP[], url: string): TransferPartner[] {
  return list.map(([to, ratioFrom, ratioTo, increment = 1000, time = "Usually instant"]) => ({
    id: `${from}->${to}`,
    fromProgram: from,
    toProgram: to,
    ratioFrom,
    ratioTo,
    increment,
    minimumTransfer: Math.max(1000, increment),
    transferTime: time,
    recipient: from === "amex-mr" ? "cardmember_or_authorized_user" : "cardmember_only",
    effectiveFrom: "2024-01-01",
    ...u(url),
  }));
}

export const TRANSFER_PARTNERS: TransferPartner[] = [
  ...buildPartners("amex-mr", AMEX_PARTNERS, AMEX_MR_TRANSFER_URL),
  ...buildPartners("chase-ur", CHASE_PARTNERS, CHASE_UR_URL),
];

/**
 * Transfer bonuses are short-lived. The sample below is explicitly `demo` so the
 * UI can demonstrate bonus maths without implying a real promotion exists.
 */
export const TRANSFER_BONUSES: TransferBonus[] = [
  {
    id: "demo-amex-virgin-20",
    fromProgram: "amex-mr",
    toProgram: "virgin",
    bonusPercent: 20,
    startDate: "2026-10-15",
    endDate: "2026-12-15",
    verification: "demo",
    sourceUrl: AMEX_MR_TRANSFER_URL,
    lastVerified: null,
    notes: "Sample promotion for demonstration — not a real offer.",
  },
  {
    id: "demo-chase-flyingblue-25",
    fromProgram: "chase-ur",
    toProgram: "flyingblue",
    bonusPercent: 25,
    startDate: "2026-10-20",
    endDate: "2026-11-30",
    verification: "demo",
    sourceUrl: CHASE_UR_URL,
    lastVerified: null,
    notes: "Sample promotion for demonstration — not a real offer.",
  },
];

/* ───────────────────────────── Portal rates ───────────────────────────── */

export const PORTAL_RATES: PortalRate[] = [
  {
    id: "chase-travel-base",
    programId: "chase-ur",
    cardId: "chase-sapphire-reserve",
    channel: "chase_travel",
    appliesTo: ["flight", "hotel"],
    centsPerPoint: 1.0,
    description: "Baseline Chase Travel redemption. Select bookings may show a higher 'Points Boost' rate in Chase Travel — PerkPilot does not assume a boost.",
    effectiveFrom: "2025-06-23",
    ...u(CHASE_TRAVEL_URL),
  },
  {
    id: "chase-travel-legacy-1_5",
    programId: "chase-ur",
    cardId: "chase-sapphire-reserve",
    channel: "chase_travel",
    appliesTo: ["flight", "hotel"],
    centsPerPoint: 1.5,
    condition: { cardOpenedBefore: "2025-06-23" },
    description: "Transitional 1.5¢ rate for points earned/held by cardmembers who opened before the 2025 refresh.",
    effectiveFrom: "2025-06-23",
    effectiveTo: "2027-10-26",
    ...u(CSR_URL),
  },
  {
    id: "amex-travel-flights",
    programId: "amex-mr",
    cardId: "amex-platinum",
    channel: "amex_travel",
    appliesTo: ["flight"],
    centsPerPoint: 1.0,
    description: "Pay with Points for flights booked through Amex Travel.",
    effectiveFrom: "2020-01-01",
    ...u("https://www.americanexpress.com/en-us/travel/"),
  },
  {
    id: "amex-travel-hotels",
    programId: "amex-mr",
    cardId: "amex-platinum",
    channel: "amex_travel",
    appliesTo: ["hotel"],
    centsPerPoint: 0.7,
    description: "Pay with Points for hotels booked through Amex Travel (lower value than flights).",
    effectiveFrom: "2020-01-01",
    ...u("https://www.americanexpress.com/en-us/travel/"),
  },
];

export const SEED_RULES: RulesDataset = {
  version: "2026.11-seed",
  asOf: "2026-11-01",
  disclaimer:
    "Card benefits, transfer partners and redemption rates change frequently. PerkPilot's starter data is unverified until you or an administrator confirm it against the official source linked on each rule.",
  programs: PROGRAMS,
  cards: CARDS,
  benefits: BENEFITS,
  transferPartners: TRANSFER_PARTNERS,
  transferBonuses: TRANSFER_BONUSES,
  portalRates: PORTAL_RATES,
};
