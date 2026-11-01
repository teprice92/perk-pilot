import type {
  BookingChannel,
  Cabin,
  Destination,
  ExperienceOffer,
  FlightOffer,
  HotelOffer,
  TripRequest,
} from "@/lib/domain/types";
import type { Confidence } from "@/lib/calc/confidence";
import type { CreditContext } from "@/lib/calc/credits";
import type { EarnSuggestion } from "@/lib/calc/earn";
import type { TransferQuote } from "@/lib/calc/transfers";
import type { DateInsight } from "@/lib/providers/types";

export type StrategyId = "savings" | "luxury" | "balanced";
export const STRATEGIES: StrategyId[] = ["balanced", "savings", "luxury"];

export type ComponentSlot = "outbound" | "return" | "hotel";

export type PaymentMethod = "cash" | "transfer_award" | "direct_award" | "portal_points" | "program_booking";

export interface PerkValue {
  name: string;
  kind: "guaranteed" | "when_available";
  valueCents: number;
  counted: boolean;
  benefitId?: string;
}

export interface PointsDraw {
  programId: string;
  points: number;
  /** Set when a specific traveler must supply the points. */
  travelerId?: string;
}

export interface PaymentOption {
  id: string;
  slot: ComponentSlot;
  offerId: string;
  method: PaymentMethod;
  label: string;
  channel: BookingChannel;
  payWithCardId?: string;
  bankProgramId?: string;
  loyaltyProgramId?: string;
  transfer?: TransferQuote;
  /** Points leaving balances, by program. */
  draws: PointsDraw[];
  /** Award price in the loyalty currency for the whole party. */
  partnerPoints?: number;
  /** Out-of-pocket cash before statement credits. */
  cashCents: number;
  /** Comparable cash cost of the same booking (the "retail" value). */
  retailCents: number;
  awardTaxesCents: number;
  awardOnlyChargesCents: number;
  /** Redemption value in cents per point spent (null for cash). */
  cpp: number | null;
  creditContext?: CreditContext;
  creditCardId?: string;
  perks: PerkValue[];
  /** Value of guaranteed perks we count (never availability-dependent perks). */
  perksValueCents: number;
  /** Monetised comfort/convenience from household preferences. */
  qualityCents: number;
  flexibility: "refundable" | "changeable" | "nonrefundable";
  cabin?: Cabin;
  tier?: HotelOffer["tier"];
  steps: string[];
  warnings: string[];
  bookingUrl: string;
  verifyUrl?: string;
  ruleRefs: string[];
  confidence: Confidence;
  earn?: EarnSuggestion | null;
}

export interface AppliedCredit {
  benefitId: string;
  name: string;
  cardId: string;
  travelerId: string;
  cents: number;
  periodKey: string;
  periodEnd: string;
}

export interface PlanComponent {
  option: PaymentOption;
  credits: AppliedCredit[];
  cashAfterCreditsCents: number;
}

export interface PlannedExperience {
  experience: ExperienceOffer;
  totalCents: number;
  credits: AppliedCredit[];
  cashAfterCreditsCents: number;
  cardTip: string | null;
  payWithCardId?: string;
}

export interface TransferInstruction {
  fromProgram: string;
  toProgram: string;
  travelerId: string;
  sourcePoints: number;
  partnerPointsReceived: number;
  ratioText: string;
  bonusPercent: number;
  transferTime: string;
  recipientNote: string;
  forSlot: ComponentSlot;
}

export interface BalanceChange {
  programId: string;
  travelerId: string;
  before: number;
  after: number;
}

export interface UnlockedBenefit {
  benefitId: string;
  name: string;
  cardId: string;
  valueCents?: number;
  kind: "credit" | "perk" | "access" | "protection" | "bonus";
  guaranteed: boolean;
  note: string;
}

export interface PlanTotals {
  retailCents: number;
  cashCents: number;
  creditsCents: number;
  perksValueCents: number;
  pointsByProgram: Record<string, number>;
  pointsValueAtBaselineCents: number;
  estimatedSavingsCents: number;
  effectiveCostCents: number;
}

export interface Plan {
  strategy: StrategyId;
  title: string;
  tagline: string;
  components: Record<ComponentSlot, PlanComponent>;
  experiences: PlannedExperience[];
  totals: PlanTotals;
  balances: BalanceChange[];
  transfers: TransferInstruction[];
  householdSteps: string[];
  benefits: UnlockedBenefit[];
  rationale: string[];
  warnings: string[];
  confidence: Confidence;
  withinBudget: boolean;
}

export interface OptimizationResult {
  id: string;
  createdAt: string;
  request: TripRequest;
  destination: Destination;
  nights: number;
  party: number;
  rooms: number;
  plans: Record<StrategyId, Plan>;
  recommended: StrategyId;
  flights: { outbound: FlightOffer[]; return: FlightOffer[] };
  hotels: HotelOffer[];
  experiences: ExperienceOffer[];
  options: Record<ComponentSlot, PaymentOption[]>;
  dateInsights: DateInsight[];
  dataNotice: string;
  rulesVersion: string;
  providers: string[];
  warnings: string[];
}
