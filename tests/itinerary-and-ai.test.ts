import { describe, expect, it } from "vitest";
import { buildItinerary, moveItem, reoptimizeItinerary, travelMinutes } from "@/lib/itinerary";
import { optimizeTrip } from "@/lib/optimizer/engine";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { demoHousehold, demoUsage } from "@/lib/demo/household";
import { parseIntent } from "@/lib/ai/fallback";
import { runTool } from "@/lib/ai/tools";
import { OptimizeBodySchema, TripRequestSchema } from "@/lib/domain/schemas";

const rules = new RulesRepository(SEED_RULES, "2026-11-01");

describe("itinerary", async () => {
  const result = await optimizeTrip({
    request: { destinationId: "paris", origin: "JFK", departDate: "2027-05-10", returnDate: "2027-05-15", flexibleDays: 0, adults: 2, children: 0 },
    household: demoHousehold(),
    rules,
    usage: demoUsage(),
  });
  const itin = buildItinerary(result, "balanced");

  it("has a day per date with flights anchored at both ends", () => {
    expect(itin.days).toHaveLength(6);
    expect(itin.days[0]!.items[0]!.kind).toBe("flight");
    const last = itin.days.at(-1)!.items;
    expect(last.at(-1)!.kind).toBe("flight");
    expect(itin.days.flatMap((d) => d.items).filter((i) => i.anchored).length).toBeGreaterThanOrEqual(4);
  });

  it("places every planned experience exactly once", () => {
    const ids = itin.days.flatMap((d) => d.items.filter((i) => i.kind === "experience").map((i) => i.refId));
    expect(new Set(ids).size).toBe(result.plans.balanced.experiences.length);
  });

  it("moves flexible items between days but never anchored ones", () => {
    const exp = itin.days.flatMap((d) => d.items).find((i) => i.kind === "experience")!;
    const target = itin.days[2]!.date;
    const moved = moveItem(itin, exp.id, target);
    expect(moved.days[2]!.items.some((i) => i.id === exp.id)).toBe(true);
    const flight = itin.days[0]!.items[0]!;
    expect(moveItem(itin, flight.id, target)).toBe(itin);
  });

  it("re-optimization is stable and keeps times ordered", () => {
    const { itinerary } = reoptimizeItinerary(itin);
    for (const d of itinerary.days) {
      const times = d.items.filter((i) => !i.anchored && i.startTime).map((i) => i.startTime!);
      expect([...times].sort()).toEqual(times);
    }
  });

  it("estimates travel time sensibly", () => {
    expect(travelMinutes(48.8606, 2.3376, 48.8606, 2.3376)).toBe(0);
    expect(travelMinutes(48.8606, 2.3376, 48.86, 2.3266)).toBeLessThan(20); // short walk
    expect(travelMinutes(48.8606, 2.3376, 48.8049, 2.1204)).toBeGreaterThan(30); // Versailles
  });
});

describe("validation", () => {
  it("rejects reversed dates and very long trips", () => {
    expect(TripRequestSchema.safeParse({ destinationId: "tokyo", origin: "SFO", departDate: "2027-04-10", returnDate: "2027-04-01" }).success).toBe(false);
    expect(TripRequestSchema.safeParse({ destinationId: "tokyo", origin: "SFO", departDate: "2027-04-01", returnDate: "2027-06-01" }).success).toBe(false);
    expect(TripRequestSchema.safeParse({ destinationId: "tokyo", origin: "sfo", departDate: "2027-04-01", returnDate: "2027-04-05" }).success).toBe(false);
  });
  it("accepts the demo household payload and defaults travelers to two adults", () => {
    const r = OptimizeBodySchema.safeParse({ request: { destinationId: "tokyo", origin: "SFO", departDate: "2027-04-01", returnDate: "2027-04-05" }, household: demoHousehold() });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.request.adults).toBe(2);
  });
});

describe("concierge tools & intent", () => {
  it("parses natural-language requests", () => {
    const i = parseIntent("Plan a romantic trip to Japan next spring and maximize our points", "2026-11-01");
    expect(i.dest?.id).toBe("tokyo");
    expect(i.styles).toContain("romantic");
    expect(i.depart.startsWith("2027-04")).toBe(true);
    const h = parseIntent("We want to go to Hawaii for seven days. Should we use Chase or Amex?", "2026-11-01");
    expect(h.dest?.id).toBe("maui");
    expect(h.wantsChaseVsAmex).toBe(true);
    expect(parseIntent("business class flights to Paris", "2026-11-01").cabin).toBe("business");
  });
  it("calculate_redemption uses the deterministic engine", async () => {
    const ctx = { household: demoHousehold(), usage: demoUsage(), rules, today: "2026-11-01", results: [] };
    const out = (await runTool("calculate_redemption", { cashPriceUsd: 1200, taxesUsd: 86, points: 70000, programId: "chase-ur" }, ctx)) as { centsPerPoint: number; verdict: string };
    expect(out.centsPerPoint).toBeCloseTo(1.5914, 3);
    expect(out.verdict).toMatch(/below/);
  });
  it("optimize_trip rejects unknown destinations instead of inventing data", async () => {
    const ctx = { household: demoHousehold(), usage: demoUsage(), rules, today: "2026-11-01", results: [] };
    const out = (await runTool("optimize_trip", { destinationId: "atlantis", departDate: "2027-01-01", returnDate: "2027-01-05" }, ctx)) as { error?: string };
    expect(out.error).toMatch(/Unknown destination/);
  });
});
