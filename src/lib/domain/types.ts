/**
 * PerkPilot core domain types.
 *
 * Conventions
 *  - Money is always integer cents (USD) to avoid floating point drift.
 *  - Points/miles are integers in the program's own currency.
 *  - Dates are ISO strings (YYYY-MM-DD) unless noted; timestamps are full ISO.
 *  - Every external fact (benefit, ratio, price) carries provenance:
 *    `verification`, `sourceUrl`, and `lastVerified` / `fetchedAt`.
 */

export type ISODate = string;
export type ISODateTime = string;

/** How much we trust a rule or a datum. */
export type VerificationStatus =
  | "verified" // checked against an official source on `lastVerified`
  | "unverified" // believed accurate from an official source but not re-checked recently
  | "estimated" // modelled / approximate — never present as fact
  | "demo"; // sample data for demonstration only

/** Where a price or availability figure came from. */
export type DataKind = "live" | "cached" | "demo";

export type ProgramKind = "bank" | "airline" | "hotel";

export interface Provenance {
  verification: VerificationStatus;
  sourceUrl?: string;
  lastVerified?: ISODate | null;
  notes?: string;
}

/** Date-effective window. `effectiveTo` is inclusive; omitted = open-ended. */
export interface Effective {
  effectiveFrom: ISODate;
  effectiveTo?: ISODate | null;
}

export type HouseholdTransferPolicy = "allowed" | "conditional" | "not_allowed" | "unknown";

/** Rules governing whether points can move between household members. */
export interface PoolingRule extends Provenance {
  householdTransfer: HouseholdTransferPolicy;
  /** Max number of other members points can be combined with (e.g. 1). */
  maxMembers?: number;
  description: string;
  conditions?: string[];
}

export interface RewardsProgram extends Provenance {
  id: string;
  name: string;
  shortName: string;
  kind: ProgramKind;
  currency: "points" | "miles" | "Avios";
  alliance?: "star" | "oneworld" | "skyteam" | null;
  /** Airline carrier codes this program can book with miles (own metal + partners). */
  bookableCarriers?: string[];
  /** Hotel loyalty: which chain brands it covers. */
  hotelChain?: string;
  pooling: PoolingRule;
  /** Can the account holder book award travel for other people? */
  canBookForOthers: boolean;
  awardSearchUrl?: string;
}

export type SpendCategory =
  | "flights_direct"
  | "hotels_direct"
  | "portal_flights"
  | "portal_hotels"
  | "dining"
  | "other_travel"
  | "other";

export interface EarnRule extends Provenance, Effective {
  category: SpendCategory;
  multiplier: number;
  /** Annual spend cap in cents for this multiplier, if any. */
  annualCapCents?: number;
  description: string;
}

export interface Card extends Provenance {
  id: string;
  name: string;
  issuer: string;
  programId: string;
  network: string;
  /** Annual fee is configurable data — never assumed in calculations. */
  annualFee?: { amountCents: number } & Effective & Provenance;
  earnRules: EarnRule[];
  /** Visual tokens for the card art (original design, not issuer artwork). */
  art: { from: string; to: string; text: string };
}

export type BookingChannel =
  | "direct"
  | "amex_travel"
  | "amex_fhr"
  | "amex_thc"
  | "chase_travel"
  | "chase_edit"
  | "resy"
  | "opentable"
  | "stubhub"
  | "any";

export type BenefitCategory =
  | "hotel_credit"
  | "airline_credit"
  | "travel_credit"
  | "dining_credit"
  | "entertainment_credit"
  | "lounge"
  | "hotel_program"
  | "trusted_traveler"
  | "insurance"
  | "elite_status"
  | "other";

export type BenefitPeriod =
  | "calendar_year"
  | "semiannual"
  | "quarterly"
  | "monthly"
  | "cardmember_year"
  | "every_4_years"
  | "every_4_5_years"
  | "per_stay"
  | "ongoing";

export type ComponentKind = "flight" | "hotel" | "experience" | "dining";

export interface HotelProgramPerk {
  name: string;
  /** guaranteed = contractually provided; when_available = depends on property/availability */
  kind: "guaranteed" | "when_available";
  /** How we estimate value. Only guaranteed perks may count toward value. */
  valuation?:
    | { type: "fixed_per_stay"; cents: number }
    | { type: "breakfast_per_night"; perPersonCents: number }
    | { type: "none" };
  /** Usefulness factor applied to fixed-value perks (e.g. property credits) 0..1. */
  usefulness?: number;
}

export interface Benefit extends Provenance, Effective {
  id: string;
  cardId: string;
  name: string;
  description: string;
  category: BenefitCategory;
  /** Credit amount per period in cents (if a statement credit). */
  amountCents?: number;
  period: BenefitPeriod;
  eligibility: string[];
  enrollmentRequired: boolean;
  bookingChannel?: BookingChannel;
  /** Which trip components the benefit can apply to. */
  appliesTo: ComponentKind[];
  /** Merchant/booking tags that must match (e.g. "fhr", "resy", "stubhub"). */
  eligibleTags?: string[];
  minNights?: number;
  /** Must the booking be prepaid through the channel? */
  prepaidRequired?: boolean;
  limitations: string[];
  renewal?: string;
  /** Applies to cardholder only, or AUs too. */
  appliesToAuthorizedUsers?: boolean;
  /** For hotel booking programs: the perks package. */
  perks?: HotelProgramPerk[];
}

export interface TransferPartner extends Provenance, Effective {
  id: string;
  fromProgram: string;
  toProgram: string;
  /** e.g. 1000 bank points → 1000 partner (1:1) or 1000 → 2000 (1:2). */
  ratioFrom: number;
  ratioTo: number;
  /** Transfers must be made in multiples of this many source points. */
  increment: number;
  minimumTransfer: number;
  transferTime: string;
  /** Whose partner account can receive points. */
  recipient: "cardmember_only" | "cardmember_or_authorized_user" | "household_member";
}

export interface TransferBonus extends Provenance {
  id: string;
  fromProgram: string;
  toProgram: string;
  bonusPercent: number;
  startDate: ISODate;
  endDate: ISODate;
}

export interface PortalRate extends Provenance, Effective {
  id: string;
  programId: string;
  cardId: string;
  channel: BookingChannel;
  appliesTo: ComponentKind[];
  /** Fixed cents-per-point redemption value through the portal. */
  centsPerPoint: number;
  /** Conditions such as "card opened before 2025-06-23". */
  condition?: { cardOpenedBefore?: ISODate };
  description: string;
}

export interface RulesDataset {
  version: string;
  asOf: ISODate;
  disclaimer: string;
  programs: RewardsProgram[];
  cards: Card[];
  benefits: Benefit[];
  transferPartners: TransferPartner[];
  transferBonuses: TransferBonus[];
  portalRates: PortalRate[];
}

/* ─────────────────────────── Household ─────────────────────────── */

export type Cabin = "economy" | "premium_economy" | "business" | "first";

export const CABIN_RANK: Record<Cabin, number> = {
  economy: 0,
  premium_economy: 1,
  business: 2,
  first: 3,
};

export type TravelStyle =
  | "romantic"
  | "food"
  | "culture"
  | "adventure"
  | "wellness"
  | "nightlife"
  | "nature"
  | "family"
  | "luxury"
  | "shopping";

export interface OwnedCard {
  cardId: string;
  role: "primary" | "authorized_user";
  /** For AUs: whose account they are on. */
  primaryTravelerId?: string;
  openedDate?: ISODate;
}

export interface PointsBalance {
  programId: string;
  points: number;
  updatedAt: ISODateTime;
}

export interface LoyaltyAccount {
  programId: string;
  /** Only the last 4 characters — never store full member numbers or passwords. */
  memberLast4?: string;
  eliteStatus?: string;
}

export interface Traveler {
  id: string;
  name: string;
  initials: string;
  color: string;
  homeAirport: string;
  cards: OwnedCard[];
  balances: PointsBalance[];
  loyalty: LoyaltyAccount[];
}

export interface TravelPreferences {
  cabin: Cabin;
  maxStops: number;
  hotelTier: "upscale" | "luxury" | "any";
  styles: TravelStyle[];
  pace: "relaxed" | "balanced" | "packed";
  preferRefundable: boolean;
  /** How much the household values comfort, used to monetise quality. */
  comfort: {
    premiumEconomyPerHourCents: number;
    businessPerHourCents: number;
    firstPerHourCents: number;
    luxuryHotelPerNightCents: number;
    stopPenaltyCents: number;
    hourPenaltyCents: number;
  };
}

export interface Household {
  id: string;
  name: string;
  mode: "demo" | "personal";
  travelers: Traveler[];
  homeAirport: string;
  preferences: TravelPreferences;
  /** Baseline valuations in cents per point, user-customisable. */
  valuations: Record<string, number>;
  /** Minimum cents-per-point to justify a redemption in "Maximum Savings". */
  minRedemptionCpp: number;
  /** Default trip cash budget in cents (0 = no budget). */
  cashBudgetCents: number;
}

export interface BenefitUsage {
  benefitId: string;
  travelerId: string;
  periodKey: string;
  usedCents: number;
  enrolled: boolean;
  updatedAt: ISODateTime;
  notes?: string;
}

export interface BenefitOverride {
  benefitId: string;
  amountCents?: number;
  verification?: VerificationStatus;
  lastVerified?: ISODate;
  disabled?: boolean;
}

/* ─────────────────────────── Trip search ─────────────────────────── */

export interface TripRequest {
  destinationId: string;
  origin: string;
  departDate: ISODate;
  returnDate: ISODate;
  flexibleDays: number;
  adults: number;
  children: number;
  cabin?: Cabin;
  styles?: TravelStyle[];
  budgetCents?: number;
  notes?: string;
}

export interface AwardOption {
  programId: string;
  pointsPerPerson: number;
  taxesPerPersonCents: number;
  /** Carrier-imposed surcharges or other award-only charges. */
  awardOnlyChargesPerPersonCents: number;
  availability: "unknown" | "estimated" | "confirmed";
  verifyUrl?: string;
}

export interface FlightOffer {
  id: string;
  provider: string;
  dataKind: DataKind;
  fetchedAt: ISODateTime;
  direction: "outbound" | "return";
  origin: string;
  destination: string;
  date: ISODate;
  departTime: string;
  arriveTime: string;
  arrivesNextDay: boolean;
  durationMin: number;
  stops: number;
  via?: string;
  carrier: string;
  carrierName: string;
  flightNumbers: string[];
  cabin: Cabin;
  cashPerPersonCents: number;
  refundable: boolean;
  awards: AwardOption[];
  bookingUrl: string;
}

export interface HotelOffer {
  id: string;
  provider: string;
  dataKind: DataKind;
  fetchedAt: ISODateTime;
  name: string;
  description: string;
  tier: "upscale" | "luxury";
  stars: number;
  rating: number;
  chainProgramId?: string;
  neighborhood: string;
  lat: number;
  lng: number;
  nightlyCashCents: number;
  taxesPct: number;
  resortFeePerNightCents: number;
  includesBreakfast: boolean;
  refundable: boolean;
  cancellationPolicy: string;
  /** Booking channels where this property participates (demo-modelled). */
  programs: Array<"amex_fhr" | "amex_thc" | "chase_edit">;
  award?: { programId: string; pointsPerNight: number; availability: AwardOption["availability"] };
  amenities: string[];
  /** Merchant/brand tags used for benefit matching (e.g. "chase_select_brand"). */
  tags: string[];
  hue: number;
  bookingUrl: string;
}

export interface ExperienceOffer {
  id: string;
  provider: string;
  dataKind: DataKind;
  name: string;
  description: string;
  category:
    | "food"
    | "dining"
    | "culture"
    | "museum"
    | "adventure"
    | "wellness"
    | "nightlife"
    | "nature"
    | "event"
    | "theme_park"
    | "shopping";
  styles: TravelStyle[];
  pricePerPersonCents: number;
  durationMin: number;
  bestTime: "morning" | "afternoon" | "evening" | "any";
  neighborhood: string;
  lat: number;
  lng: number;
  rating: number;
  premium: boolean;
  /** Platform tags — benefits only apply when tags match benefit.eligibleTags. */
  tags: string[];
  bookingUrl: string;
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  region: string;
  aliases: string[];
  airports: string[];
  lat: number;
  lng: number;
  tagline: string;
  blurb: string;
  palette: [string, string, string];
  emoji: string;
  costIndex: number;
  bestMonths: number[];
  neighborhoods: string[];
}
