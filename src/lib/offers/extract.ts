import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Read card-linked offers (Amex Offers / Chase Offers) from screenshots of the
 * issuer app or from pasted offer emails. Returns offers for the user to
 * review — nothing is saved until they confirm in the app.
 */

const MODEL = process.env.PERKPILOT_LLM_MODEL ?? "claude-opus-5-5";
const CATEGORIES = ["hotel", "airline", "travel", "car_rental", "dining", "entertainment", "shopping", "other"] as const;
const KINDS = ["statement_credit", "bonus_points", "percent_back"] as const;

export const ExtractedOfferSchema = z.object({
  merchant: z.string().min(1).max(120),
  description: z.string().max(400),
  kind: z.enum(KINDS),
  rewardCents: z.number().int().min(0).max(10_000_000).nullable(),
  rewardPoints: z.number().int().min(0).max(10_000_000).nullable(),
  percent: z.number().min(0).max(100).nullable(),
  minSpendCents: z.number().int().min(0).max(100_000_000).nullable(),
  expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  category: z.enum(CATEGORIES),
  terms: z.string().max(600).nullable(),
});
export type ExtractedOffer = z.infer<typeof ExtractedOfferSchema>;

const ResultSchema = z.object({ readable: z.boolean(), offers: z.array(ExtractedOfferSchema).max(100) });

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

const TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_offers",
  description: "Submit every card-linked offer you can read. Call exactly once.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["readable", "offers"],
    properties: {
      readable: { type: "boolean", description: "False if the input doesn't show card-linked offers." },
      offers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["merchant", "description", "kind", "rewardCents", "rewardPoints", "percent", "minSpendCents", "expires", "category", "terms"],
          properties: {
            merchant: { type: "string" },
            description: { type: "string", description: "The offer as written, e.g. 'Spend $250 or more, earn $50 back'." },
            kind: { type: "string", enum: [...KINDS] },
            rewardCents: nullable({ type: "integer", description: "Credit, or maximum credit, in US cents." }),
            rewardPoints: nullable({ type: "integer" }),
            percent: nullable({ type: "number", description: "Percent back, e.g. 10 for 10%." }),
            minSpendCents: nullable({ type: "integer", description: "Minimum spend in US cents." }),
            expires: nullable({ type: "string", description: "Expiry as YYYY-MM-DD." }),
            category: { type: "string", enum: [...CATEGORIES] },
            terms: nullable({ type: "string", description: "Key conditions only (e.g. 'Online only', 'One per card')." }),
          },
        },
      },
    },
  },
};

const SYSTEM = `You read card-linked merchant offers (like Amex Offers or Chase Offers) from screenshots of a banking app or from offer emails.
- Include only offers you can actually read; never invent merchants, amounts or dates.
- Amounts are US cents ($50 → 5000). If an expiry has no year, use the next occurrence on or after today.
- Category: hotel (hotel chains and booking sites for hotels), airline, travel (cruises, travel agencies, other travel), car_rental, dining, entertainment, shopping, other.
- If the input doesn't show offers, set readable to false.
Call submit_offers exactly once.`;

export interface OfferInput {
  images?: Array<{ mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string }>;
  text?: string;
  cardName: string;
  today: string;
}

export class OfferExtractionError extends Error {}

export async function extractOffers(input: OfferInput, client = new Anthropic()): Promise<ExtractedOffer[]> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(input.images ?? []).map((img): Anthropic.Beta.BetaImageBlockParam => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } })),
    { type: "text", text: `Today is ${input.today}. These offers are on the ${input.cardName}.${input.text ? `\n\nOffer text:\n<offers>\n${input.text}\n</offers>` : ""}` },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  for (let step = 0; step < 2; step++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools: [TOOL],
      messages,
    });
    if (response.stop_reason === "refusal") throw new OfferExtractionError("Claude declined to read these offers.");
    if (response.stop_reason === "max_tokens") throw new OfferExtractionError("Too many offers at once — try fewer screenshots.");
    const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_offers");
    if (call) {
      const parsed = ResultSchema.safeParse(call.input);
      if (!parsed.success) throw new OfferExtractionError("Couldn't read the offers in the expected format.");
      if (!parsed.data.readable) throw new OfferExtractionError("No card offers found — use a screenshot of the offers list or paste the offer email.");
      return parsed.data.offers;
    }
    messages.push({ role: "assistant", content: response.content }, { role: "user", content: "Call submit_offers now." });
  }
  throw new OfferExtractionError("Claude didn't return any offers.");
}
