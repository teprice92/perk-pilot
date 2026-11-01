import { describe, expect, it } from "vitest";
import { CreditLedger, evaluateCredit } from "@/lib/calc/credits";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { demoHousehold, demoUsage } from "@/lib/demo/household";
import { householdBalances } from "@/lib/optimizer/balances";

const rules = new RulesRepository(SEED_RULES, "2026-11-01");

describe("rules repository", () => {
  it("is date-effective: the legacy hotel credit applies before the refresh, the new one after", () => {
    const before = new RulesRepository(SEED_RULES, "2025-06-01").benefits({ cardId: "amex-platinum" }).map((b) => b.id);
    const after = rules.benefits({ cardId: "amex-platinum" }).map((b) => b.id);
    expect(before).toContain("amex-plat-hotel-credit-legacy");
    expect(before).not.toContain("amex-plat-hotel-credit-2025");
    expect(after).toContain("amex-plat-hotel-credit-2025");
    expect(after).not.toContain("amex-plat-hotel-credit-legacy");
  });
  it("time-boxed benefits expire", () => {
    expect(new RulesRepository(SEED_RULES, "2027-01-15").benefits().some((b) => b.id === "csr-select-hotels-2026")).toBe(false);
  });
  it("applies household overrides and can disable rules", () => {
    const r = new RulesRepository(SEED_RULES, "2026-11-01", [
      { benefitId: "csr-travel-credit", amountCents: 12345, verification: "verified", lastVerified: "2026-10-30" },
      { benefitId: "csr-stubhub", disabled: true },
    ]);
    expect(r.benefit("csr-travel-credit")).toMatchObject({ amountCents: 12345, verification: "verified" });
    expect(r.benefit("csr-stubhub")).toBeUndefined();
  });
  it("portal rate honours the transitional card-open-date condition", () => {
    expect(rules.portalRate("chase-sapphire-reserve", "flight", "2023-01-01")?.centsPerPoint).toBe(1.5);
    expect(rules.portalRate("chase-sapphire-reserve", "flight", "2025-08-01")?.centsPerPoint).toBe(1.0);
    expect(new RulesRepository(SEED_RULES, "2027-11-01").portalRate("chase-sapphire-reserve", "flight", "2023-01-01")?.centsPerPoint).toBe(1.0);
  });
  it("every seeded rule carries provenance and is not marked verified", () => {
    for (const b of SEED_RULES.benefits) {
      expect(b.sourceUrl).toMatch(/^https:\/\//);
      expect(b.verification).not.toBe("verified");
    }
    for (const t of SEED_RULES.transferBonuses) expect(t.verification).toBe("demo");
  });
});

describe("credits", () => {
  const hotelCredit = rules.benefit("amex-plat-hotel-credit-2025")!;
  const ctx = { chargeDate: "2026-11-01", component: "hotel" as const, channel: "amex_fhr" as const, tags: ["fhr"], spendCents: 120_000, nights: 3, prepaid: true };
  it("applies only through the right channel and prepaid", () => {
    expect(evaluateCredit(hotelCredit, ctx, { usedCents: 0, enrolled: true }).usableCents).toBe(30_000);
    expect(evaluateCredit(hotelCredit, { ...ctx, channel: "direct", tags: [] }, { usedCents: 0, enrolled: true }).usableCents).toBe(0);
    expect(evaluateCredit(hotelCredit, { ...ctx, prepaid: false }, { usedCents: 0, enrolled: true }).reason).toMatch(/prepaid/);
  });
  it("caps at remaining balance and spend", () => {
    expect(evaluateCredit(hotelCredit, ctx, { usedCents: 25_000, enrolled: true }).usableCents).toBe(5_000);
    expect(evaluateCredit(hotelCredit, { ...ctx, spendCents: 8_000 }, { usedCents: 0, enrolled: true }).usableCents).toBe(8_000);
  });
  it("requires enrollment when the rule says so", () => {
    const stubhub = rules.benefit("csr-stubhub")!;
    const ev = evaluateCredit(stubhub, { chargeDate: "2026-11-01", component: "experience", channel: "stubhub", tags: ["stubhub"], spendCents: 30_000 }, { usedCents: 0, enrolled: false });
    expect(ev.usableCents).toBe(0);
    expect(ev.reason).toMatch(/Enrollment/);
  });
  it("enforces minimum nights", () => {
    const edit = rules.benefit("csr-edit-credit")!;
    expect(evaluateCredit(edit, { ...ctx, channel: "chase_edit", tags: ["the_edit"], nights: 1 }, { usedCents: 0, enrolled: true }).usableCents).toBe(0);
  });
  it("ledger never double-counts across purchases", () => {
    const ledger = new CreditLedger(rules.benefits(), demoHousehold(), demoUsage());
    const a = ledger.apply(ctx);
    const b = ledger.apply(ctx);
    const total = [...a, ...b].filter((x) => x.benefitId === hotelCredit.id).reduce((s, x) => s + x.usableCents, 0);
    expect(total).toBe(30_000);
  });
  it("authorized users don't get the primary cardmember's credits", () => {
    const ledger = new CreditLedger(rules.benefits(), demoHousehold(), demoUsage());
    expect(ledger.holders(hotelCredit)).toEqual(["t-alex"]);
  });
});

describe("household pooling", () => {
  const h = demoHousehold();
  h.travelers[0]!.balances.push({ programId: "chase-ur", points: 20_000, updatedAt: "" });
  const bal = householdBalances(h, rules);
  it("Chase UR can be combined with one household member", () => {
    expect(bal.maxAccessible("chase-ur")).toBe(148_900 + 20_000);
    const r = bal.allocate([{ programId: "chase-ur", points: 160_000 }]);
    expect(r.feasible).toBe(true);
    expect(r.steps[0]).toMatch(/Combine/);
  });
  it("Amex MR is never combined between members", () => {
    const h2 = demoHousehold();
    h2.travelers[1]!.balances.push({ programId: "amex-mr", points: 50_000, updatedAt: "" });
    const b2 = householdBalances(h2, rules);
    expect(b2.maxAccessible("amex-mr")).toBe(186_400);
    expect(b2.allocate([{ programId: "amex-mr", points: 200_000 }]).feasible).toBe(false);
    // Two separate draws can each come from a different member.
    expect(b2.allocate([{ programId: "amex-mr", points: 150_000 }, { programId: "amex-mr", points: 40_000 }]).feasible).toBe(true);
  });
  it("programs with unknown pooling rules are treated as not combinable", () => {
    const h3 = demoHousehold();
    h3.travelers[0]!.balances.push({ programId: "hyatt", points: 10_000, updatedAt: "" });
    expect(householdBalances(h3, rules).maxAccessible("hyatt")).toBe(18_500);
  });
});
