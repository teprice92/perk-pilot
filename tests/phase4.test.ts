import { describe, expect, it } from "vitest";
import { parseIntent } from "@/lib/ai/fallback";
import { TripRequestSchema } from "@/lib/domain/schemas";
import { creditResetCalendar } from "@/lib/ics";
import { buildItinerary, moveItem, stayForDate } from "@/lib/itinerary";
import { normalizeResult } from "@/lib/optimizer/compat";
import { diffResults } from "@/lib/optimizer/diff";
import { dateShifts, optimizeTrip } from "@/lib/optimizer/engine";
import { buildSlots } from "@/lib/optimizer/slots";
import { verificationFreshness } from "@/lib/rules/freshness";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { householdTips } from "@/lib/strategies/household";
import { creditStatuses } from "@/lib/wallet";
import { demoHousehold, demoUsage } from "@/lib/demo/household";
import type { TripRequest } from "@/lib/domain/types";

const rules = new RulesRepository(SEED_RULES, "2026-11-01");
const multiReq: TripRequest = { destinationId: "paris", stops: [{ destinationId: "paris", nights: 3 }, { destinationId: "london", nights: 3 }], origin: "JFK", departDate: "2027-05-10", returnDate: "2027-05-16", flexibleDays: 0, adults: 2, children: 0 };

describe("multi-city", async () => {
  const r = await optimizeTrip({ request: multiReq, household: demoHousehold(), rules, usage: demoUsage() });

  it("builds ordered flight and hotel slots", () => {
    expect(buildSlots(multiReq).map((s) => s.slot)).toEqual(["outbound", "leg-1", "return", "hotel", "hotel-2"]);
    expect(r.slots.find((s) => s.slot === "leg-1")).toMatchObject({ date: "2027-05-13", fromDestinationId: "paris", toDestinationId: "london" });
    expect(r.slots.find((s) => s.slot === "hotel-2")).toMatchObject({ checkIn: "2027-05-13", checkOut: "2027-05-16", nights: 3 });
  });
  it("every plan books every slot, with hotels in the right city and a regional inter-city leg", () => {
    for (const p of Object.values(r.plans)) {
      expect(Object.keys(p.components).sort()).toEqual(["hotel", "hotel-2", "leg-1", "outbound", "return"]);
      expect(r.hotels.find((h) => h.id === p.components["hotel-2"]!.option.offerId)!.destinationId).toBe("london");
      const leg = r.flights["leg-1"]!.find((f) => f.id === p.components["leg-1"]!.option.offerId)!;
      expect(["CDG", "ORY"]).toContain(leg.origin);
      expect(["LHR", "LGW"]).toContain(leg.destination);
    }
  });
  it("never double counts credits across the two stays and never overdraws points", () => {
    for (const p of Object.values(r.plans)) {
      const byKey = new Map<string, number>();
      for (const c of [...Object.values(p.components).flatMap((x) => x.credits), ...p.experiences.flatMap((e) => e.credits)]) byKey.set(`${c.benefitId}|${c.travelerId}|${c.periodKey}`, (byKey.get(`${c.benefitId}|${c.travelerId}|${c.periodKey}`) ?? 0) + c.cents);
      for (const [k, v] of byKey) expect(v).toBeLessThanOrEqual(rules.benefit(k.split("|")[0]!)!.amountCents!);
      for (const b of p.balances) expect(b.after).toBeGreaterThanOrEqual(0);
    }
  });
  it("plans experiences in both cities", () => {
    const cities = new Set(r.plans.balanced.experiences.map((e) => e.experience.destinationId));
    expect(cities).toEqual(new Set(["paris", "london"]));
  });
  it("builds an itinerary that switches hotels on the transition day", () => {
    const it = buildItinerary(r, "balanced");
    expect(it.stays).toHaveLength(2);
    const transition = it.days.find((d) => d.date === "2027-05-13")!;
    const ids = transition.items.map((i) => i.id);
    expect(ids).toContain("checkout-hotel");
    expect(ids).toContain("flight-leg-1");
    expect(ids.some((i) => i.startsWith("checkin-hotel-2"))).toBe(true);
    expect(stayForDate(it, "2027-05-14").name).toBe(it.stays![1]!.name);
    // flexible items are inserted before closing anchors on the final day
    const exp = it.days.flatMap((d) => d.items).find((i) => i.kind === "experience")!;
    const moved = moveItem(it, exp.id, "2027-05-16");
    const last = moved.days.at(-1)!.items;
    expect(last.findIndex((i) => i.id === exp.id)).toBeLessThan(last.findIndex((i) => i.id === "flight-return"));
  });
  it("validates that stop nights add up", () => {
    expect(TripRequestSchema.safeParse(multiReq).success).toBe(true);
    expect(TripRequestSchema.safeParse({ ...multiReq, stops: [{ destinationId: "paris", nights: 2 }, { destinationId: "london", nights: 2 }] }).success).toBe(false);
  });
  it("parses multi-city requests in deterministic concierge mode", () => {
    const i = parseIntent("Two weeks in Tokyo and Kyoto next spring", "2026-11-01");
    expect(i.stops?.map((s) => s.destinationId)).toEqual(["tokyo", "kyoto"]);
    expect(i.stops!.reduce((a, s) => a + s.nights, 0)).toBe(14);
  });
});

describe("flexible dates, upgrades, diffs", async () => {
  const req: TripRequest = { destinationId: "maui", origin: "SFO", departDate: "2027-04-10", returnDate: "2027-04-17", flexibleDays: 2, adults: 2, children: 0, cabin: "economy" };
  const r = await optimizeTrip({ request: req, household: demoHousehold(), rules, usage: demoUsage() });

  it("re-optimizes nearby date shifts with the same trip length", () => {
    expect(dateShifts(2)).toEqual([-2, -1, 1, 2]);
    expect(dateShifts(0)).toEqual([]);
    expect(r.dateAlternatives.map((a) => a.shiftDays)).toEqual([-2, -1, 1, 2]);
    for (const a of r.dateAlternatives) expect((Date.parse(a.returnDate) - Date.parse(a.departDate)) / 86_400_000).toBe(7);
  });
  it("analyses premium-cabin upgrades on the same flight", () => {
    const ups = Object.values(r.plans).flatMap((p) => p.upgrades);
    expect(ups.length).toBeGreaterThan(0);
    for (const u of ups) expect(["worth_it", "consider", "poor_value"]).toContain(u.verdict);
  });
  it("diffs a re-optimized result", () => {
    const tweaked = structuredClone(r);
    tweaked.plans.balanced.totals.cashCents += 5_000;
    const d = diffResults(r, tweaked).find((x) => x.strategy === "balanced")!;
    expect(d.cashDeltaCents).toBe(5_000);
    expect(d.changedSlots).toEqual([]);
  });
  it("normalizes results saved before multi-city support", () => {
    const legacy = structuredClone(r) as unknown as Record<string, unknown>;
    delete legacy.slots;
    delete legacy.destinations;
    delete legacy.dateAlternatives;
    const n = normalizeResult(legacy as never);
    expect(n.slots.map((s) => s.slot)).toEqual(["outbound", "return", "hotel"]);
    expect(n.destinations).toHaveLength(1);
  });
});

describe("household strategies, calendar, freshness", () => {
  it("explains ownership, pooling and enrollment gaps", () => {
    const h = demoHousehold();
    h.travelers[0]!.balances.push({ programId: "chase-ur", points: 10_000, updatedAt: "" });
    const tips = householdTips(h, rules, demoUsage(), "2026-11-01");
    expect(tips.some((t) => t.id === "pool-chase-ur")).toBe(true);
    const own = tips.find((t) => t.id === "own-amex-mr-t-alex")!;
    expect(own.body).toMatch(/Jordan is an authorized user/);
    expect(tips.some((t) => t.id.startsWith("enroll-csr-stubhub"))).toBe(true);
    expect(tips.some((t) => t.kind === "bonus")).toBe(true);
  });
  it("flags valuations below a guaranteed portal floor", () => {
    const h = demoHousehold();
    h.valuations["chase-ur"] = 1.0;
    expect(householdTips(h, rules, [], "2026-11-01").some((t) => t.id === "val-chase-ur" && t.impact === "high")).toBe(true);
  });
  it("exports credit resets as a valid calendar", () => {
    const ics = creditResetCalendar(creditStatuses(demoHousehold(), demoUsage(), rules, "2026-11-01"), (id) => id, 14);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("TRIGGER:-P14D");
    expect(ics.split("BEGIN:VEVENT").length - 1).toBe(ics.split("END:VEVENT").length - 1);
  });
  it("marks verifications older than 90 days as stale", () => {
    expect(verificationFreshness("verified", "2026-10-01", "2026-11-01")).toBe("fresh");
    expect(verificationFreshness("verified", "2026-06-01", "2026-11-01")).toBe("stale");
    expect(verificationFreshness("unverified", null, "2026-11-01")).toBe("never");
  });
});

describe("itinerary timing", () => {
  it("never schedules activities on a late-night arrival day or past 23:00", async () => {
    const requests: TripRequest[] = [
      ...["paris", "tokyo", "london", "bali"].map((destinationId) => ({ destinationId, origin: "SFO", departDate: "2026-12-31", returnDate: "2027-01-07", flexibleDays: 0, adults: 2, children: 0 })),
      { destinationId: "paris", stops: [{ destinationId: "paris", nights: 3 }, { destinationId: "london", nights: 4 }], origin: "SFO", departDate: "2026-12-31", returnDate: "2027-01-07", flexibleDays: 0, adults: 2, children: 0 },
      { destinationId: "tokyo", stops: [{ destinationId: "tokyo", nights: 4 }, { destinationId: "kyoto", nights: 3 }], origin: "SFO", departDate: "2027-04-02", returnDate: "2027-04-09", flexibleDays: 0, adults: 2, children: 0 },
    ];
    for (const request of requests) {
      const destinationId = request.stops?.map((x) => x.destinationId).join("+") ?? request.destinationId;
      const r = await optimizeTrip({ request, household: demoHousehold(), rules, usage: demoUsage() });
      for (const s of ["savings", "balanced", "luxury"] as const) {
        const it = buildItinerary(r, s);
        for (const d of it.days) {
          for (const i of d.items.filter((x) => x.kind === "experience")) expect(i.startTime! < "23:00", `${destinationId} ${d.date} ${i.title} ${i.startTime}`).toBe(true);
          const busy = d.items.filter((x) => !x.anchored).reduce((a, x) => a + x.durationMin, 0);
          expect(busy, `${destinationId} ${d.date} overloaded`).toBeLessThanOrEqual(12 * 60);
        }
      }
    }
  });
});
