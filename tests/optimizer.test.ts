import { describe, expect, it } from "vitest";
import { optimizeTrip } from "@/lib/optimizer/engine";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { demoHousehold, demoUsage } from "@/lib/demo/household";
import type { TripRequest } from "@/lib/domain/types";

const rules = new RulesRepository(SEED_RULES, "2026-11-01");
const req: TripRequest = { destinationId: "tokyo", origin: "SFO", departDate: "2027-04-02", returnDate: "2027-04-09", flexibleDays: 1, adults: 2, children: 0 };

describe("optimizeTrip", async () => {
  const result = await optimizeTrip({ request: req, household: demoHousehold(), rules, usage: demoUsage() });

  it("produces three plans", () => {
    expect(Object.keys(result.plans).sort()).toEqual(["balanced", "luxury", "savings"]);
    expect(result.nights).toBe(7);
    expect(result.party).toBe(2);
  });

  it("savings plan never costs more cash than luxury", () => {
    expect(result.plans.savings.totals.cashCents).toBeLessThanOrEqual(result.plans.luxury.totals.cashCents);
  });

  it("savings plan respects the minimum redemption value", () => {
    for (const c of Object.values(result.plans.savings.components)) {
      if (c.option.draws.length && c.option.cpp !== null) expect(c.option.cpp).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("never spends more points than the household can access", () => {
    for (const plan of Object.values(result.plans)) {
      for (const b of plan.balances) expect(b.after).toBeGreaterThanOrEqual(0);
    }
  });

  it("never double counts a credit within a period", () => {
    for (const plan of Object.values(result.plans)) {
      const all = [...Object.values(plan.components).flatMap((c) => c.credits), ...plan.experiences.flatMap((e) => e.credits)];
      const byKey = new Map<string, number>();
      for (const c of all) byKey.set(`${c.benefitId}|${c.travelerId}|${c.periodKey}`, (byKey.get(`${c.benefitId}|${c.travelerId}|${c.periodKey}`) ?? 0) + c.cents);
      for (const [key, cents] of byKey) {
        const b = rules.benefit(key.split("|")[0]!)!;
        expect(cents).toBeLessThanOrEqual(b.amountCents!);
      }
    }
  });

  it("totals are internally consistent", () => {
    for (const plan of Object.values(result.plans)) {
      const comp = Object.values(plan.components).reduce((a, c) => a + c.cashAfterCreditsCents, 0);
      const exp = plan.experiences.reduce((a, e) => a + e.cashAfterCreditsCents, 0);
      expect(plan.totals.cashCents).toBe(comp + exp);
      expect(plan.totals.estimatedSavingsCents).toBe(Math.max(0, plan.totals.retailCents - plan.totals.cashCents));
    }
  });

  it("labels demo data and never claims confirmed availability", () => {
    expect(result.dataNotice).toMatch(/Demonstration/);
    for (const f of result.flights.outbound) for (const a of f.awards) expect(a.availability).not.toBe("confirmed");
    expect(result.plans.balanced.confidence.level).not.toBe("high");
  });

  it("every transfer is an explicit instruction", () => {
    for (const plan of Object.values(result.plans)) {
      const xferOpts = Object.values(plan.components).filter((c) => c.option.transfer);
      expect(plan.transfers.length).toBe(xferOpts.length);
    }
  });
});
