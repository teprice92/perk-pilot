import { z } from "zod";
import type { BenefitUsage, Household, TripRequest } from "@/lib/domain/types";
import { centsPerPoint } from "@/lib/calc/cpp";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import { optimizeTrip } from "@/lib/optimizer/engine";
import type { OptimizationResult } from "@/lib/optimizer/types";
import { DESTINATIONS, destinationById } from "@/lib/providers/demo/catalog";
import type { RulesRepository } from "@/lib/rules/repository";
import { creditStatuses, householdPoints } from "@/lib/wallet";

/**
 * Structured tools the LLM can call. Every number the concierge states must
 * come from one of these — the model is told never to invent prices, ratios,
 * availability or card benefits.
 */

export interface ToolContext {
  household: Household;
  usage: BenefitUsage[];
  rules: RulesRepository;
  today: string;
  /** Results produced during this conversation turn, returned to the client. */
  results: OptimizationResult[];
}

const OptimizeInput = z.object({
  destinationId: z.string(),
  stops: z.array(z.object({ destinationId: z.string(), nights: z.number().int().min(1).max(21) })).min(2).max(4).optional(),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(8).default(2),
  children: z.number().int().min(0).max(6).default(0),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  styles: z.array(z.enum(["romantic", "food", "culture", "adventure", "wellness", "nightlife", "nature", "family", "luxury", "shopping"])).optional(),
  flexibleDays: z.number().int().min(0).max(3).default(0),
  budgetUsd: z.number().min(0).optional(),
  origin: z.string().regex(/^[A-Z]{3}$/).optional(),
});

const CppInput = z.object({ cashPriceUsd: z.number().min(0), taxesUsd: z.number().min(0), surchargesUsd: z.number().min(0).default(0), points: z.number().int().positive(), programId: z.string().optional() });

export const TOOL_DEFINITIONS = [
  {
    name: "list_destinations",
    description: "List destinations PerkPilot has data for (demo catalogue), with ids, best months and airports. Call this before optimize_trip to get a valid destinationId.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_household_summary",
    description: "The household's travelers, cards (primary vs authorized user), points balances by owner, pooling rules, baseline valuations, minimum redemption value, budget and remaining statement credits.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_card_benefits",
    description: "Card benefits from the rules database, with amounts, periods, eligibility, booking channel, enrollment and verification status. Filter by cardId (amex-platinum | chase-sapphire-reserve) and/or category.",
    input_schema: {
      type: "object" as const,
      properties: {
        cardId: { type: "string", description: "amex-platinum or chase-sapphire-reserve" },
        category: { type: "string", description: "hotel_credit, airline_credit, travel_credit, dining_credit, entertainment_credit, lounge, hotel_program, trusted_traveler, insurance, elite_status" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_transfer_options",
    description: "Transfer partners with ratios, increments, transfer times and any active transfer bonuses. Filter by fromProgram (amex-mr | chase-ur) and/or toProgram (e.g. hyatt, united, virgin, avios-ba).",
    input_schema: {
      type: "object" as const,
      properties: { fromProgram: { type: "string" }, toProgram: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "optimize_trip",
    description: "Run PerkPilot's deterministic optimizer for a trip (single or multi-city). Returns three strategies (Maximum Savings, Balanced Value, Maximum Luxury) with cash, points by program, chosen flights/hotel, cents-per-point, credits, transfers needed and confidence. Prices are demo estimates unless stated otherwise.",
    input_schema: {
      type: "object" as const,
      properties: {
        destinationId: { type: "string", description: "First (or only) destination id" },
        stops: {
          type: "array",
          description: "Multi-city only: ordered stops with nights each; nights must add up to the trip length.",
          items: { type: "object", properties: { destinationId: { type: "string" }, nights: { type: "integer", minimum: 1 } }, required: ["destinationId", "nights"], additionalProperties: false },
        },
        departDate: { type: "string", description: "YYYY-MM-DD" },
        returnDate: { type: "string", description: "YYYY-MM-DD" },
        adults: { type: "integer", minimum: 1, maximum: 8 },
        children: { type: "integer", minimum: 0, maximum: 6 },
        cabin: { type: "string", enum: ["economy", "premium_economy", "business", "first"] },
        styles: { type: "array", items: { type: "string", enum: ["romantic", "food", "culture", "adventure", "wellness", "nightlife", "nature", "family", "luxury", "shopping"] } },
        flexibleDays: { type: "integer", minimum: 0, maximum: 3 },
        budgetUsd: { type: "number", minimum: 0 },
        origin: { type: "string", description: "3-letter departure airport; defaults to the household home airport" },
      },
      required: ["destinationId", "departDate", "returnDate"],
      additionalProperties: false,
    },
  },
  {
    name: "calculate_redemption",
    description: "Deterministically compute cents-per-point for a redemption and compare it with the household's baseline valuation.",
    input_schema: {
      type: "object" as const,
      properties: {
        cashPriceUsd: { type: "number" },
        taxesUsd: { type: "number" },
        surchargesUsd: { type: "number" },
        points: { type: "integer" },
        programId: { type: "string" },
      },
      required: ["cashPriceUsd", "taxesUsd", "points"],
      additionalProperties: false,
    },
  },
];

export function summarizeResult(r: OptimizationResult, rules: RulesRepository) {
  return {
    tripId: r.id,
    destination: (r.destinations ?? [r.destination]).map((d) => d.name).join(" → "),
    dates: `${r.request.departDate} → ${r.request.returnDate} (${r.nights} nights)`,
    travelers: r.party,
    dataKind: "demo estimates — not live prices; award availability unconfirmed",
    recommended: r.recommended,
    dateAlternatives: (r.dateAlternatives ?? []).map((a) => ({ shiftDays: a.shiftDays, dates: `${a.departDate} → ${a.returnDate}`, balancedCash: formatUSD(a.plans.balanced.cashCents), savingsCash: formatUSD(a.plans.savings.cashCents) })),
    plans: Object.fromEntries(
      Object.entries(r.plans).map(([k, p]) => [
        k,
        {
          title: p.title,
          cashOutOfPocket: formatUSD(p.totals.cashCents),
          estimatedRetailValue: formatUSD(p.totals.retailCents),
          estimatedSavings: formatUSD(p.totals.estimatedSavingsCents),
          creditsApplied: formatUSD(p.totals.creditsCents),
          points: Object.entries(p.totals.pointsByProgram).map(([prog, pts]) => `${formatPoints(pts)} ${rules.programName(prog)}`),
          bookings: (r.slots ?? []).map((info) => {
            const c = p.components[info.slot]!;
            if (info.kind === "hotel") return `${info.label}: ${r.hotels.find((h) => h.id === c.option.offerId)?.name} · ${c.option.label} · cash ${formatUSD(c.cashAfterCreditsCents)}`;
            return `${info.label}: ${c.option.cabin} · ${c.option.label} · cash ${formatUSD(c.cashAfterCreditsCents)}${c.option.cpp ? ` · ${c.option.cpp.toFixed(2)}¢/pt` : ""}`;
          }),
          cabinUpgrades: p.upgrades.map((u) => `${u.verdict}: ${u.note}`),
          transfers: p.transfers.map((t) => `${formatPoints(t.sourcePoints)} ${rules.programName(t.fromProgram)} → ${rules.programName(t.toProgram)}${t.bonusPercent ? ` (+${t.bonusPercent}% bonus)` : ""}`),
          householdSteps: p.householdSteps,
          rationale: p.rationale,
          experiences: p.experiences.map((e) => e.experience.name),
          confidence: `${p.confidence.level} (${p.confidence.score})`,
          warnings: p.warnings.slice(0, 4),
        },
      ]),
    ),
  };
}

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  const { household, rules, usage, today } = ctx;
  switch (name) {
    case "list_destinations":
      return DESTINATIONS.map((d) => ({ id: d.id, name: d.name, country: d.country, region: d.region, airports: d.airports, bestMonths: d.bestMonths, tagline: d.tagline }));
    case "get_household_summary": {
      const pts = householdPoints(household, rules);
      const credits = creditStatuses(household, usage, rules, today);
      return {
        mode: household.mode,
        homeAirport: household.homeAirport,
        travelers: household.travelers.map((t) => ({
          id: t.id,
          name: t.name,
          cards: t.cards.map((c) => ({ card: rules.card(c.cardId)?.name, role: c.role })),
          balances: t.balances.map((b) => ({ program: rules.programName(b.programId), programId: b.programId, points: b.points })),
          elite: t.loyalty.filter((l) => l.eliteStatus).map((l) => `${rules.programName(l.programId)}: ${l.eliteStatus}`),
        })),
        pooling: pts.list.map((p) => ({ program: p.program?.shortName, rule: p.program?.pooling.householdTransfer, description: p.program?.pooling.description })),
        valuationsCentsPerPoint: household.valuations,
        minRedemptionCpp: household.minRedemptionCpp,
        cashBudget: household.cashBudgetCents ? formatUSD(household.cashBudgetCents) : "none",
        preferences: { cabin: household.preferences.cabin, styles: household.preferences.styles, pace: household.preferences.pace, maxStops: household.preferences.maxStops },
        creditsRemaining: credits.filter((c) => c.remainingCents > 0).map((c) => ({ benefit: c.benefit.name, holder: household.travelers.find((t) => t.id === c.travelerId)?.name, remaining: formatUSD(c.remainingCents), periodEnds: c.periodEnd, enrolled: c.enrolled, verification: c.benefit.verification })),
      };
    }
    case "get_card_benefits": {
      const input = (rawInput ?? {}) as { cardId?: string; category?: string };
      return rules
        .benefits({ cardId: input.cardId, date: today })
        .filter((b) => !input.category || b.category === input.category)
        .map((b) => ({ id: b.id, card: b.cardId, name: b.name, description: b.description, amount: b.amountCents ? formatUSD(b.amountCents) : null, period: b.period, bookingChannel: b.bookingChannel, enrollmentRequired: b.enrollmentRequired, eligibility: b.eligibility, limitations: b.limitations, perks: b.perks?.map((p) => `${p.name} (${p.kind})`), verification: b.verification, lastVerified: b.lastVerified, sourceUrl: b.sourceUrl }));
    }
    case "get_transfer_options": {
      const input = (rawInput ?? {}) as { fromProgram?: string; toProgram?: string };
      return rules
        .transferPartners(input.fromProgram, today)
        .filter((t) => !input.toProgram || t.toProgram === input.toProgram)
        .map((t) => {
          const bonus = rules.activeBonus(t.fromProgram, t.toProgram, today);
          return { from: rules.programName(t.fromProgram), to: rules.programName(t.toProgram), toProgramId: t.toProgram, ratio: `${t.ratioFrom}:${t.ratioTo}`, increment: t.increment, transferTime: t.transferTime, recipient: t.recipient, verification: t.verification, activeBonus: bonus ? { percent: bonus.bonusPercent, ends: bonus.endDate, verification: bonus.verification, note: bonus.notes } : null };
        });
    }
    case "optimize_trip": {
      const input = OptimizeInput.parse(rawInput);
      if (!destinationById(input.destinationId)) return { error: `Unknown destinationId "${input.destinationId}". Call list_destinations.` };
      if (input.returnDate <= input.departDate) return { error: "returnDate must be after departDate" };
      const tripNights = Math.round((Date.parse(input.returnDate) - Date.parse(input.departDate)) / 86_400_000);
      if (input.stops) {
        const bad = input.stops.find((s) => !destinationById(s.destinationId));
        if (bad) return { error: `Unknown destinationId "${bad.destinationId}" in stops.` };
        if (input.stops.reduce((a, s) => a + s.nights, 0) !== tripNights) return { error: `Stop nights must add up to ${tripNights}.` };
      }
      const request: TripRequest = {
        destinationId: input.stops?.[0]?.destinationId ?? input.destinationId,
        stops: input.stops,
        origin: input.origin ?? household.homeAirport,
        departDate: input.departDate,
        returnDate: input.returnDate,
        flexibleDays: input.flexibleDays,
        adults: input.adults,
        children: input.children,
        cabin: input.cabin,
        styles: input.styles,
        budgetCents: input.budgetUsd !== undefined ? Math.round(input.budgetUsd * 100) : undefined,
      };
      const result = await optimizeTrip({ request, household, rules, usage });
      ctx.results.push(result);
      return summarizeResult(result, rules);
    }
    case "calculate_redemption": {
      const input = CppInput.parse(rawInput);
      const cpp = centsPerPoint({ comparableCashCents: Math.round(input.cashPriceUsd * 100), awardTaxesCents: Math.round(input.taxesUsd * 100), awardOnlyChargesCents: Math.round(input.surchargesUsd * 100), points: input.points });
      const baseline = input.programId ? household.valuations[input.programId] : undefined;
      return { centsPerPoint: cpp, baselineCentsPerPoint: baseline ?? null, verdict: cpp === null ? "invalid" : baseline === undefined ? "no baseline set" : cpp >= baseline ? "above your baseline — a good use of points" : "below your baseline — consider paying cash", minimumForSavingsMode: household.minRedemptionCpp };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
