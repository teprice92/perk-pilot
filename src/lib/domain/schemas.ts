import { z } from "zod";

/** Zod schemas validate everything that crosses the network boundary. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const airport = z.string().regex(/^[A-Z]{3}$/, "Expected a 3-letter airport code");
const cabin = z.enum(["economy", "premium_economy", "business", "first"]);
const style = z.enum(["romantic", "food", "culture", "adventure", "wellness", "nightlife", "nature", "family", "luxury", "shopping"]);

export const TripRequestSchema = z
  .object({
    destinationId: z.string().min(1).max(64),
    origin: airport,
    departDate: isoDate,
    returnDate: isoDate,
    flexibleDays: z.number().int().min(0).max(3).default(0),
    adults: z.number().int().min(1).max(8).default(2),
    children: z.number().int().min(0).max(6).default(0),
    cabin: cabin.optional(),
    styles: z.array(style).max(10).optional(),
    budgetCents: z.number().int().min(0).max(100_000_000).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((r) => r.returnDate > r.departDate, { message: "Return date must be after departure", path: ["returnDate"] })
  .refine((r) => (Date.parse(r.returnDate) - Date.parse(r.departDate)) / 86_400_000 <= 30, {
    message: "Trips longer than 30 nights are not supported yet",
    path: ["returnDate"],
  });

const balance = z.object({ programId: z.string().max(40), points: z.number().int().min(0).max(100_000_000), updatedAt: z.string().max(40) });
const ownedCard = z.object({
  cardId: z.string().max(60),
  role: z.enum(["primary", "authorized_user"]),
  primaryTravelerId: z.string().max(60).optional(),
  openedDate: isoDate.optional(),
});
const loyalty = z.object({ programId: z.string().max(40), memberLast4: z.string().max(4).optional(), eliteStatus: z.string().max(60).optional() });

export const HouseholdSchema = z.object({
  id: z.string().max(60),
  name: z.string().max(120),
  mode: z.enum(["demo", "personal"]),
  homeAirport: z.string().max(3),
  travelers: z
    .array(
      z.object({
        id: z.string().max(60),
        name: z.string().max(60),
        initials: z.string().max(3),
        color: z.string().max(20),
        homeAirport: z.string().max(3),
        cards: z.array(ownedCard).max(20),
        balances: z.array(balance).max(60),
        loyalty: z.array(loyalty).max(60),
      }),
    )
    .min(1)
    .max(6),
  preferences: z.object({
    cabin,
    maxStops: z.number().int().min(0).max(3),
    hotelTier: z.enum(["upscale", "luxury", "any"]),
    styles: z.array(style).max(10),
    pace: z.enum(["relaxed", "balanced", "packed"]),
    preferRefundable: z.boolean(),
    comfort: z.object({
      premiumEconomyPerHourCents: z.number().int().min(0).max(100_000),
      businessPerHourCents: z.number().int().min(0).max(100_000),
      firstPerHourCents: z.number().int().min(0).max(100_000),
      luxuryHotelPerNightCents: z.number().int().min(0).max(1_000_000),
      stopPenaltyCents: z.number().int().min(0).max(100_000),
      hourPenaltyCents: z.number().int().min(0).max(100_000),
    }),
  }),
  valuations: z.record(z.string(), z.number().min(0).max(10)),
  minRedemptionCpp: z.number().min(0).max(10),
  cashBudgetCents: z.number().int().min(0).max(100_000_000),
});

export const BenefitUsageSchema = z.object({
  benefitId: z.string().max(80),
  travelerId: z.string().max(60),
  periodKey: z.string().max(20),
  usedCents: z.number().int().min(0).max(10_000_000),
  enrolled: z.boolean(),
  updatedAt: z.string().max(40),
  notes: z.string().max(200).optional(),
});

export const BenefitOverrideSchema = z.object({
  benefitId: z.string().max(80),
  amountCents: z.number().int().min(0).max(10_000_000).optional(),
  verification: z.enum(["verified", "unverified", "estimated", "demo"]).optional(),
  lastVerified: isoDate.optional(),
  disabled: z.boolean().optional(),
});

export const OptimizeBodySchema = z.object({
  request: TripRequestSchema,
  household: HouseholdSchema,
  usage: z.array(BenefitUsageSchema).max(500).default([]),
  overrides: z.array(BenefitOverrideSchema).max(500).default([]),
});

export type OptimizeBody = z.infer<typeof OptimizeBodySchema>;
