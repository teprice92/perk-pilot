import { describe, expect, it } from "vitest";
import { AIRPORTS, DESTINATIONS, detectAllDestinationsInText, findDestination } from "@/lib/providers/demo/catalog";
import { buildExperiences, buildHotels, routesFor } from "@/lib/providers/demo/destinations";
import { optimizeTrip } from "@/lib/optimizer/engine";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { demoHousehold, demoUsage } from "@/lib/demo/household";

const rules = new RulesRepository(SEED_RULES, "2026-11-01");

describe("extended catalogue", () => {
  it("has unique ids, known airports and sensible data for every destination", () => {
    expect(new Set(DESTINATIONS.map((d) => d.id)).size).toBe(DESTINATIONS.length);
    expect(DESTINATIONS.length).toBeGreaterThan(60);
    for (const d of DESTINATIONS) {
      for (const a of d.airports) expect(AIRPORTS[a], `${d.id} airport ${a}`).toBeDefined();
      expect(Math.abs(d.lat)).toBeLessThanOrEqual(90);
      expect(d.neighborhoods.length).toBeGreaterThan(0);
      expect(routesFor(d.id).length, `${d.id} routes`).toBeGreaterThan(0);
      expect(buildHotels(d.id, 1, "2026-11-04T00:00:00Z").length, `${d.id} hotels`).toBeGreaterThan(3);
      expect(buildExperiences(d.id).length, `${d.id} experiences`).toBeGreaterThan(5);
    }
  });

  it("finds new destinations by name and alias without hijacking existing ones", () => {
    expect(findDestination("Barcelona")?.id).toBe("barcelona");
    expect(findDestination("positano")?.id).toBe("amalfi");
    expect(findDestination("napa")?.id).toBe("napa");
    expect(findDestination("las vegas")?.id).toBe("las-vegas");
    expect(findDestination("tokyo")?.id).toBe("tokyo");
    expect(findDestination("mexico city")?.id).toBe("mexico-city");
    expect(detectAllDestinationsInText("Lisbon then Barcelona then Rome").map((d) => d.id)).toEqual(["lisbon", "barcelona", "rome"]);
  });

  it.each(["barcelona", "aspen", "bora-bora", "cusco"])("optimizes a trip to %s with demo data", async (destinationId) => {
    const result = await optimizeTrip({
      request: { destinationId, origin: "DEN", departDate: "2027-03-10", returnDate: "2027-03-15", flexibleDays: 0, adults: 2, children: 0 },
      household: demoHousehold(),
      rules,
      usage: demoUsage(),
    });
    const plan = result.plans.balanced;
    expect(Object.keys(plan.components)).toEqual(expect.arrayContaining(["outbound", "return", "hotel"]));
    expect(result.experiences.length).toBeGreaterThan(5);
  });
});
