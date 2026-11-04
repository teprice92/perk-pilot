import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/rules-db", async () => ({ loadRules: async () => (await import("@/lib/rules/seed")).SEED_RULES }));

import type Anthropic from "@anthropic-ai/sdk";
import { SEED_RULES } from "@/lib/rules/seed";
import { htmlToText, normalizeForHash } from "@/lib/watcher/page";
import { currentDataFor, extractChanges, ExtractionError, type ExtractedProposal } from "@/lib/watcher/extract";
import { applyProposal, ApplyError, proposalFingerprint } from "@/lib/watcher/apply";
import { extractOffers, OfferExtractionError } from "@/lib/offers/extract";
import { matchOffers } from "@/lib/offers/match";
import type { CardOffer } from "@/lib/domain/types";
import type { OptimizationResult, Plan } from "@/lib/optimizer/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A stand-in Anthropic client whose create() returns the given messages in order. */
function fakeClient(...responses: Array<Partial<Anthropic.Beta.BetaMessage>>) {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce({ stop_reason: "tool_use", content: [], ...r });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}
const toolUse = (name: string, input: unknown): Anthropic.Beta.BetaToolUseBlock => ({ type: "tool_use", id: "tu_1", name, input } as Anthropic.Beta.BetaToolUseBlock);

const PLAT = { label: "Amex Platinum — card benefits", url: "https://www.americanexpress.com/us/credit-cards/card/platinum/", kind: "card_benefits" as const, cardId: "amex-platinum" };
const benefitProposal: ExtractedProposal = {
  action: "update",
  ruleType: "benefit",
  ruleId: SEED_RULES.benefits.find((b) => b.cardId === "amex-platinum" && b.amountCents)!.id,
  title: "Credit amount changed",
  explanation: "The page now says $250.",
  evidence: "Get up to $250 in statement credits",
  confidence: "high",
  benefit: { name: "Credit", description: "Up to $250", category: "travel_credit", amountCents: 25000, period: "calendar_year", enrollmentRequired: true, bookingChannel: "any", appliesTo: ["flight"], limitations: [] },
  transferPartner: null,
  transferBonus: null,
};

describe("page text", () => {
  it("strips markup, scripts and entities", () => {
    const text = htmlToText("<html><head><title>x</title></head><body><script>var a=1</script><h1>Platinum&nbsp;Card&reg;</h1><p>$200 &amp; more</p></body></html>");
    expect(text).toBe("Platinum Card®\n$200 & more");
  });
  it("ignores whitespace and footer year changes when hashing", () => {
    expect(normalizeForHash("Hello  World\n© 2025 Amex")).toBe(normalizeForHash("hello world\n© 2026 Amex"));
  });
});

describe("extractChanges", () => {
  it("sends the page text and current data, and validates the result", async () => {
    const { client, create } = fakeClient({ content: [toolUse("submit_changes", { pageReadable: true, summary: "One credit changed.", proposals: [benefitProposal] })] });
    const out = await extractChanges(PLAT, SEED_RULES, "2026-11-04", "Platinum page text ".repeat(100), client);
    expect(out.proposals).toHaveLength(1);
    const req = create.mock.calls[0]![0];
    expect(req.tools.map((t: { name: string }) => t.name)).toEqual(["submit_changes"]);
    expect(req.messages[0].content).toContain("amex-platinum");
    expect(req.fallbacks).toBe("default");
  });

  it("uses Claude's web fetch when there is no page text", async () => {
    const { client, create } = fakeClient({ content: [toolUse("submit_changes", { pageReadable: true, summary: "No changes.", proposals: [] })] });
    await extractChanges(PLAT, SEED_RULES, "2026-11-04", undefined, client);
    expect(create.mock.calls[0]![0].tools[0]).toMatchObject({ type: "web_fetch_20260209", name: "web_fetch" });
  });

  it("rejects malformed answers and refusals", async () => {
    const bad = fakeClient({ content: [toolUse("submit_changes", { pageReadable: true, summary: "x", proposals: [{ action: "explode" }] })] });
    await expect(extractChanges(PLAT, SEED_RULES, "2026-11-04", "text", bad.client)).rejects.toBeInstanceOf(ExtractionError);
    const refused = fakeClient({ stop_reason: "refusal" });
    await expect(extractChanges(PLAT, SEED_RULES, "2026-11-04", "text", refused.client)).rejects.toThrow(/declined/);
  });

  it("gives Claude only this card's live benefits", () => {
    const data = currentDataFor(PLAT, SEED_RULES, "2026-11-04") as { benefits: Array<{ id: string }> };
    expect(data.benefits.length).toBeGreaterThan(3);
    expect(data.benefits.every((b) => SEED_RULES.benefits.find((x) => x.id === b.id)!.cardId === "amex-platinum")).toBe(true);
  });
});

describe("proposals", () => {
  it("fingerprints the same change identically", () => {
    expect(proposalFingerprint("s1", benefitProposal)).toBe(proposalFingerprint("s1", { ...benefitProposal, title: "Reworded", evidence: "other quote" }));
    expect(proposalFingerprint("s1", benefitProposal)).not.toBe(proposalFingerprint("s1", { ...benefitProposal, benefit: { ...benefitProposal.benefit!, amountCents: 30000 } }));
  });

  function fakeDb(existing: Record<string, unknown> = {}) {
    const calls: Array<[string, string, unknown]> = [];
    const model = (name: string) => ({
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => existing[`${name}:${where.id}`] ?? null),
      update: vi.fn(async (a: unknown) => calls.push([name, "update", a])),
      create: vi.fn(async (a: unknown) => calls.push([name, "create", a])),
      upsert: vi.fn(async (a: unknown) => calls.push([name, "upsert", a])),
    });
    const tx = { benefit: model("benefit"), card: model("card"), transferPartner: model("transferPartner"), transferBonus: model("transferBonus"), rewardsProgram: model("rewardsProgram"), ruleVerification: model("ruleVerification") };
    return { db: { rewardsProgram: { count: async () => 20 }, $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as never, calls };
  }

  it("applies an approved benefit update and logs it", async () => {
    const { db, calls } = fakeDb({ [`benefit:${benefitProposal.ruleId}`]: { id: benefitProposal.ruleId } });
    const id = await applyProposal(db, { ...benefitProposal, payload: { benefit: benefitProposal.benefit }, source: PLAT }, SEED_RULES, "2026-11-04", "Owner");
    expect(id).toBe(benefitProposal.ruleId);
    const update = calls.find(([m, op]) => m === "benefit" && op === "update")![2] as { data: Record<string, unknown> };
    expect(update.data).toMatchObject({ amountCents: 25000, verification: "verified", sourceUrl: PLAT.url });
    expect(calls.some(([m]) => m === "ruleVerification")).toBe(true);
  });

  it("adds a new benefit and a transfer bonus", async () => {
    const { db, calls } = fakeDb({ "card:amex-platinum": { id: "amex-platinum" } });
    const id = await applyProposal(db, { action: "add", ruleType: "benefit", ruleId: null, payload: { benefit: { ...benefitProposal.benefit!, name: "New Lounge Credit" } }, source: PLAT }, SEED_RULES, "2026-11-04", "Owner");
    expect(id).toBe("amex-platinum-new-lounge-credit");
    const bonus = await applyProposal(db, { action: "add", ruleType: "transferBonus", ruleId: null, payload: { transferBonus: { toProgram: "virgin", bonusPercent: 30, startDate: "2026-11-01", endDate: "2026-11-30" } }, source: PLAT }, SEED_RULES, "2026-11-04", "Owner");
    expect(bonus).toBe("bonus-amex-mr-virgin-2026-11-01");
    expect(calls.filter(([m]) => m === "ruleVerification")).toHaveLength(2);
  });

  it("refuses to update a rule that isn't in the database", async () => {
    const { db } = fakeDb();
    await expect(applyProposal(db, { ...benefitProposal, payload: { benefit: benefitProposal.benefit }, source: PLAT }, SEED_RULES, "2026-11-04", "Owner")).rejects.toBeInstanceOf(ApplyError);
  });
});

describe("checkSource", () => {
  function sourceDb() {
    const proposals = new Map<string, unknown>();
    const updates: unknown[] = [];
    return {
      updates,
      proposals,
      db: {
        watchedSource: { update: vi.fn(async (a: unknown) => updates.push(a)) },
        ruleProposal: { findUnique: vi.fn(async ({ where }: { where: { fingerprint: string } }) => proposals.get(where.fingerprint) ?? null), create: vi.fn(async ({ data }: { data: { fingerprint: string } }) => proposals.set(data.fingerprint, data)) },
      } as never,
    };
  }
  const source = { id: "src1", label: PLAT.label, url: PLAT.url, kind: "card_benefits", cardId: "amex-platinum", programId: null, enabled: true, aiFetch: true, contentHash: null, contentChars: null, lastCheckedAt: null, lastChangedAt: null, lastStatus: null, lastMessage: null, createdAt: new Date() };

  it("skips the AI when the page hasn't changed", async () => {
    const { checkSource } = await import("@/lib/watcher/run");
    const html = `<html><body>${"<p>Platinum benefits list</p>".repeat(100)}</body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { headers: { "content-type": "text/html" } })));
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(normalizeForHash(htmlToText(html))).digest("hex");
    const { db } = sourceDb();
    const r = await checkSource(db, { ...source, contentHash: hash });
    expect(r.status).toBe("unchanged");
  });

  it("reports blocked pages without AI when AI fetch is off", async () => {
    const { checkSource } = await import("@/lib/watcher/run");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    const { db } = sourceDb();
    const r = await checkSource(db, { ...source, aiFetch: false });
    expect(r.status).toBe("blocked");
    expect(r.message).toMatch(/403/);
  });
});

describe("offers", () => {
  const offerInput = { merchant: "Hilton", description: "Spend $250+, get $50 back", kind: "statement_credit", rewardCents: 5000, rewardPoints: null, percent: null, minSpendCents: 25000, expires: "2026-12-31", category: "hotel", terms: null };

  it("reads offers from screenshots", async () => {
    const { client, create } = fakeClient({ content: [toolUse("submit_offers", { readable: true, offers: [offerInput] })] });
    const offers = await extractOffers({ images: [{ mediaType: "image/jpeg", data: "abc" }], cardName: "Amex Platinum", today: "2026-11-04" }, client);
    expect(offers[0]).toMatchObject({ merchant: "Hilton", rewardCents: 5000 });
    expect(create.mock.calls[0]![0].messages[0].content[0]).toMatchObject({ type: "image" });
  });

  it("says so when the image has no offers", async () => {
    const { client } = fakeClient({ content: [toolUse("submit_offers", { readable: false, offers: [] })] });
    await expect(extractOffers({ text: "hello there, this is not an offer", cardName: "x", today: "2026-11-04" }, client)).rejects.toBeInstanceOf(OfferExtractionError);
  });

  it("matches hotel offers to the chain being booked with cash", () => {
    const offer: CardOffer = { id: "o1", travelerId: "t-1", cardId: "amex-platinum", merchant: "Hilton", description: "Spend $250+, get $50 back", kind: "statement_credit", rewardCents: 5000, category: "hotel", source: "manual", addedAt: "2026-11-01" };
    const result = { flights: {}, hotels: [{ id: "h1", name: "Shinjuku Skyline Grand", chainProgramId: "hilton" }] } as unknown as OptimizationResult;
    const plan = { components: { hotel: { option: { offerId: "h1", method: "cash" } } } } as unknown as Plan;
    const m = matchOffers(result, plan, [offer], "2026-11-04");
    expect(m).toHaveLength(1);
    expect(m[0]!.reason).toMatch(/Pay for this stay/);
    expect(matchOffers(result, plan, [{ ...offer, expires: "2026-10-01" }], "2026-11-04")).toHaveLength(0);
    expect(matchOffers(result, plan, [{ ...offer, merchant: "Marriott" }], "2026-11-04")).toHaveLength(0);
  });
});
