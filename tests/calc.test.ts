import { describe, expect, it } from "vitest";
import { centsPerPoint, centsPerPointFromDollars, pointsValueCents } from "@/lib/calc/cpp";
import { effectiveRatio, partnerPointsFor, quoteTransfer } from "@/lib/calc/transfers";
import { periodFor } from "@/lib/calc/periods";
import { scoreConfidence } from "@/lib/calc/confidence";
import type { TransferBonus, TransferPartner } from "@/lib/domain/types";

const partner = (over: Partial<TransferPartner> = {}): TransferPartner => ({
  id: "x", fromProgram: "bank", toProgram: "air", ratioFrom: 1, ratioTo: 1, increment: 1000, minimumTransfer: 1000,
  transferTime: "instant", recipient: "cardmember_only", effectiveFrom: "2020-01-01", verification: "unverified", ...over,
});
const bonus = (pct: number): TransferBonus => ({ id: "b", fromProgram: "bank", toProgram: "air", bonusPercent: pct, startDate: "2026-01-01", endDate: "2026-12-31", verification: "demo" });

describe("centsPerPoint", () => {
  it("implements the spec formula", () => {
    // $1,200 fare, $86 taxes, $0 surcharges, 70,000 points → (1200-86)/70000*100 = 1.5914¢
    expect(centsPerPoint({ comparableCashCents: 120_000, awardTaxesCents: 8_600, points: 70_000 })).toBeCloseTo(1.5914, 4);
  });
  it("subtracts unavoidable award-only charges", () => {
    expect(centsPerPoint({ comparableCashCents: 500_000, awardTaxesCents: 20_000, awardOnlyChargesCents: 60_000, points: 100_000 })).toBe(4.2);
  });
  it("matches the dollar form of the spec formula", () => {
    expect(centsPerPointFromDollars(1200, 86, 0, 70_000)).toBeCloseTo(centsPerPoint({ comparableCashCents: 120_000, awardTaxesCents: 8_600, points: 70_000 })!, 6);
  });
  it("returns null for zero points and can go negative for bad redemptions", () => {
    expect(centsPerPoint({ comparableCashCents: 10_000, awardTaxesCents: 0, points: 0 })).toBeNull();
    expect(centsPerPoint({ comparableCashCents: 10_000, awardTaxesCents: 20_000, points: 10_000 })!).toBeLessThan(0);
  });
  it("values points at a baseline", () => {
    expect(pointsValueCents(50_000, 1.6)).toBe(80_000);
  });
});

describe("transfers", () => {
  it("1:1 rounds up to the transfer increment", () => {
    const q = quoteTransfer(60_500, partner());
    expect(q.sourcePoints).toBe(61_000);
    expect(q.partnerPointsReceived).toBe(61_000);
  });
  it("1:2 hotel partner halves the source points", () => {
    const q = quoteTransfer(95_000, partner({ ratioFrom: 1, ratioTo: 2 }));
    expect(q.sourcePoints).toBe(48_000);
    expect(q.partnerPointsReceived).toBe(96_000);
  });
  it("5:4 partner (1000→800) needs more source points", () => {
    const q = quoteTransfer(80_000, partner({ ratioFrom: 1000, ratioTo: 800 }));
    expect(q.sourcePoints).toBe(100_000);
    expect(q.partnerPointsReceived).toBe(80_000);
  });
  it("250:200 increments", () => {
    const p = partner({ ratioFrom: 250, ratioTo: 200, increment: 250, minimumTransfer: 1000 });
    const q = quoteTransfer(20_100, p);
    expect(q.partnerPointsReceived).toBeGreaterThanOrEqual(20_100);
    expect(q.sourcePoints % 250).toBe(0);
    expect(partnerPointsFor(q.sourcePoints - 250, p)).toBeLessThan(20_100);
  });
  it("applies transfer bonuses", () => {
    expect(effectiveRatio(partner(), bonus(30))).toBeCloseTo(1.3);
    const q = quoteTransfer(65_000, partner(), bonus(30));
    expect(q.sourcePoints).toBe(50_000);
    expect(q.partnerPointsReceived).toBe(65_000);
    expect(q.bonusPercent).toBe(30);
  });
  it("respects the minimum transfer", () => {
    expect(quoteTransfer(200, partner()).sourcePoints).toBe(1000);
    expect(quoteTransfer(0, partner()).sourcePoints).toBe(0);
  });
});

describe("benefit periods", () => {
  it("semiannual", () => {
    expect(periodFor("semiannual", "2026-03-02").key).toBe("2026-H1");
    expect(periodFor("semiannual", "2026-11-01")).toMatchObject({ key: "2026-H2", end: "2026-12-31" });
  });
  it("quarterly", () => {
    expect(periodFor("quarterly", "2026-11-01")).toMatchObject({ key: "2026-Q4", start: "2026-10-01", end: "2026-12-31" });
  });
  it("cardmember year from anniversary", () => {
    expect(periodFor("cardmember_year", "2026-11-01", "08-02")).toMatchObject({ key: "CY2026", start: "2026-08-02", end: "2027-08-01" });
    expect(periodFor("cardmember_year", "2026-03-01", "08-02")).toMatchObject({ key: "CY2025", end: "2026-08-01" });
  });
});

describe("confidence", () => {
  it("demo data is never high confidence", () => {
    expect(scoreConfidence({ dataKind: "demo", ruleStatuses: ["verified"] }).level).not.toBe("high");
  });
  it("fresh live data with verified rules is high", () => {
    expect(scoreConfidence({ dataKind: "live", ageHours: 1, ruleStatuses: ["verified"], availability: "confirmed" }).level).toBe("high");
  });
  it("stale data lowers confidence", () => {
    const fresh = scoreConfidence({ dataKind: "cached", ageHours: 1, ruleStatuses: [] }).score;
    const stale = scoreConfidence({ dataKind: "cached", ageHours: 48, ruleStatuses: [] }).score;
    expect(stale).toBeLessThan(fresh);
  });
});
