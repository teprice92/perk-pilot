import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { RulesDataset } from "@/lib/domain/types";

/**
 * Ask Claude to compare an official page with PerkPilot's current rules and
 * report only real differences, each with a verbatim quote as evidence.
 * Nothing here changes data: results become proposals the owner approves.
 */

const MODEL = process.env.PERKPILOT_LLM_MODEL ?? "claude-opus-5-5";

export interface WatchSourceInfo {
  label: string;
  url: string;
  kind: "card_benefits" | "transfer_partners";
  cardId?: string | null;
  programId?: string | null;
}

const CATEGORIES = ["hotel_credit", "airline_credit", "travel_credit", "dining_credit", "entertainment_credit", "lounge", "hotel_program", "trusted_traveler", "insurance", "elite_status", "other"] as const;
const PERIODS = ["calendar_year", "semiannual", "quarterly", "monthly", "cardmember_year", "every_4_years", "every_4_5_years", "per_stay", "ongoing"] as const;
const CHANNELS = ["direct", "amex_travel", "amex_fhr", "amex_thc", "chase_travel", "chase_edit", "resy", "opentable", "stubhub", "any"] as const;
const COMPONENTS = ["flight", "hotel", "experience", "dining"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BenefitFields = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(600),
  category: z.enum(CATEGORIES),
  amountCents: z.number().int().min(0).max(10_000_000).nullable(),
  period: z.enum(PERIODS),
  enrollmentRequired: z.boolean(),
  bookingChannel: z.enum(CHANNELS).nullable(),
  appliesTo: z.array(z.enum(COMPONENTS)).max(4),
  limitations: z.array(z.string().max(300)).max(8),
});

export const PartnerFields = z.object({
  toProgram: z.string().min(1).max(60),
  ratioFrom: z.number().int().min(1).max(100_000),
  ratioTo: z.number().int().min(1).max(100_000),
  transferTime: z.string().max(80),
});

export const BonusFields = z.object({
  toProgram: z.string().min(1).max(60),
  bonusPercent: z.number().int().min(1).max(300),
  startDate: isoDate,
  endDate: isoDate,
});

export const ProposalSchema = z.object({
  action: z.enum(["add", "update", "retire"]),
  ruleType: z.enum(["benefit", "transferPartner", "transferBonus"]),
  ruleId: z.string().max(120).nullable(),
  title: z.string().min(3).max(140),
  explanation: z.string().min(3).max(800),
  evidence: z.string().min(3).max(1200),
  confidence: z.enum(["high", "medium", "low"]),
  benefit: BenefitFields.nullable(),
  transferPartner: PartnerFields.nullable(),
  transferBonus: BonusFields.nullable(),
});
export type ExtractedProposal = z.infer<typeof ProposalSchema>;

export const ExtractionSchema = z.object({
  pageReadable: z.boolean(),
  summary: z.string().max(1000),
  proposals: z.array(ProposalSchema).max(25),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const enumOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });

/** JSON schema for the strict `submit_changes` tool (mirrors ExtractionSchema). */
const SUBMIT_TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_changes",
  description: "Submit the differences between the official page and PerkPilot's current data. Call exactly once, with an empty proposals list if nothing changed.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["pageReadable", "summary", "proposals"],
    properties: {
      pageReadable: { type: "boolean", description: "False if the page content was missing, a login wall, a block page, or unrelated to this card/program." },
      summary: { type: "string", description: "One or two sentences on what changed, or that nothing material changed." },
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action", "ruleType", "ruleId", "title", "explanation", "evidence", "confidence", "benefit", "transferPartner", "transferBonus"],
          properties: {
            action: enumOf(["add", "update", "retire"]),
            ruleType: enumOf(["benefit", "transferPartner", "transferBonus"]),
            ruleId: nullable({ type: "string", description: "Existing rule id for update/retire; null for add." }),
            title: { type: "string" },
            explanation: { type: "string", description: "What is different from PerkPilot's current data." },
            evidence: { type: "string", description: "A short verbatim quote from the page supporting the change." },
            confidence: enumOf(["high", "medium", "low"]),
            benefit: nullable({
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "category", "amountCents", "period", "enrollmentRequired", "bookingChannel", "appliesTo", "limitations"],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                category: enumOf(CATEGORIES),
                amountCents: nullable({ type: "integer", description: "Credit per period in US cents, e.g. $200 → 20000." }),
                period: enumOf(PERIODS),
                enrollmentRequired: { type: "boolean" },
                bookingChannel: nullable(enumOf(CHANNELS)),
                appliesTo: { type: "array", items: enumOf(COMPONENTS) },
                limitations: { type: "array", items: { type: "string" } },
              },
            }),
            transferPartner: nullable({
              type: "object",
              additionalProperties: false,
              required: ["toProgram", "ratioFrom", "ratioTo", "transferTime"],
              properties: { toProgram: { type: "string", description: "A program id from the list provided." }, ratioFrom: { type: "integer" }, ratioTo: { type: "integer" }, transferTime: { type: "string" } },
            }),
            transferBonus: nullable({
              type: "object",
              additionalProperties: false,
              required: ["toProgram", "bonusPercent", "startDate", "endDate"],
              properties: { toProgram: { type: "string" }, bonusPercent: { type: "integer" }, startDate: { type: "string", description: "YYYY-MM-DD" }, endDate: { type: "string", description: "YYYY-MM-DD" } },
            }),
          },
        },
      },
    },
  },
};

const SYSTEM = `You maintain PerkPilot's database of credit card benefits and points transfer partners. You compare an official issuer page with the data PerkPilot currently holds and report differences so a person can review them.

Rules:
- Report only material differences: a credit added, removed, or changed in amount, period, eligibility, enrollment or booking channel; a transfer partner added or removed; a changed transfer ratio; a current or upcoming transfer bonus with dates. Ignore wording changes that don't change what a cardholder gets, and ignore marketing copy, sign-up offers and rates/fees.
- Every proposal needs a short verbatim quote from the page as evidence. If you can't quote it, don't propose it.
- For update and retire, ruleId must be an id from the current data. For add, ruleId is null.
- Fill exactly one of benefit / transferPartner / transferBonus to match ruleType (the full new values, not just the changed fields); set the others to null. For retire, give the current values.
- Amounts are US cents. Use program ids from the list provided for toProgram; if a partner isn't in the list, skip it.
- If the page is unreadable, a login wall, or about something else, set pageReadable to false and return no proposals.
- If nothing material changed, return an empty proposals list. When unsure, use confidence "low" rather than guessing.
Call submit_changes exactly once.`;

export function currentDataFor(source: WatchSourceInfo, rules: RulesDataset, today: string) {
  const live = <T extends { effectiveTo?: string | null }>(r: T) => !r.effectiveTo || r.effectiveTo >= today;
  const programs = rules.programs.map((p) => ({ id: p.id, name: p.name }));
  if (source.kind === "card_benefits") {
    const card = rules.cards.find((c) => c.id === source.cardId);
    return {
      card: card ? { id: card.id, name: card.name, programId: card.programId } : { id: source.cardId },
      benefits: rules.benefits
        .filter((b) => b.cardId === source.cardId && live(b))
        .map((b) => ({ id: b.id, name: b.name, description: b.description, category: b.category, amountCents: b.amountCents ?? null, period: b.period, enrollmentRequired: b.enrollmentRequired, bookingChannel: b.bookingChannel ?? null, appliesTo: b.appliesTo, limitations: b.limitations })),
      transferBonuses: rules.transferBonuses.filter((t) => t.fromProgram === card?.programId && t.endDate >= today && t.verification !== "demo"),
      programs,
    };
  }
  return {
    program: rules.programs.find((p) => p.id === source.programId) ? { id: source.programId, name: rules.programs.find((p) => p.id === source.programId)!.name } : { id: source.programId },
    transferPartners: rules.transferPartners.filter((t) => t.fromProgram === source.programId && live(t)).map((t) => ({ id: t.id, toProgram: t.toProgram, ratioFrom: t.ratioFrom, ratioTo: t.ratioTo, transferTime: t.transferTime })),
    transferBonuses: rules.transferBonuses.filter((t) => t.fromProgram === source.programId && t.endDate >= today && t.verification !== "demo"),
    programs,
  };
}

export class ExtractionError extends Error {}

/**
 * Run the comparison. Pass `pageText` when PerkPilot (or the owner) already has
 * the page content; otherwise Claude fetches `source.url` with the web fetch tool.
 */
export async function extractChanges(source: WatchSourceInfo, rules: RulesDataset, today: string, pageText?: string, client = new Anthropic()): Promise<Extraction> {
  const current = JSON.stringify(currentDataFor(source, rules, today));
  const intro = `Today is ${today}. Page: ${source.label} — ${source.url}\nKind: ${source.kind === "card_benefits" ? "card benefits" : "transfer partners"}\n\nPerkPilot's current data (JSON):\n${current}`;
  const userContent = pageText
    ? `${intro}\n\nOfficial page text:\n<page>\n${pageText}\n</page>`
    : `${intro}\n\nFetch the official page at ${source.url} with web_fetch, then compare it with the current data.`;
  const tools: Anthropic.Beta.BetaToolUnion[] = pageText ? [SUBMIT_TOOL] : [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 }, SUBMIT_TOOL];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userContent }];

  for (let step = 0; step < 4; step++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools,
      messages,
    });
    if (response.stop_reason === "refusal") throw new ExtractionError("Claude declined to review this page.");
    if (response.stop_reason === "max_tokens") throw new ExtractionError("The review was cut off — try pasting a shorter part of the page.");
    const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_changes");
    if (call) {
      const parsed = ExtractionSchema.safeParse(call.input);
      if (!parsed.success) throw new ExtractionError("Claude's answer didn't match the expected format.");
      return parsed.data;
    }
    // Server-side web fetch can pause a long turn; continue it. Otherwise nudge once.
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Call submit_changes now with your findings." });
  }
  throw new ExtractionError("Claude didn't return a result.");
}
