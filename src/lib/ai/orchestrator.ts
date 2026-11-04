import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fallbackConcierge } from "./fallback";
import { runTool, TOOL_DEFINITIONS, type ToolContext } from "./tools";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MODEL = process.env.PERKPILOT_LLM_MODEL || "claude-opus-5-5";
const MAX_STEPS = 8;
/** Cap on tool-call results fed back to the model, per call (keeps context and cost bounded). */
const MAX_TOOL_RESULT_CHARS = 24_000;

function systemPrompt(today: string, tripContext?: string) {
  return `You are PerkPilot's AI travel concierge for a household of travelers who hold the American Express Platinum Card and the Chase Sapphire Reserve. Today is ${today}.

Your job: understand what they want, call PerkPilot's tools to get verified data and deterministic calculations, then explain the best strategy warmly and concisely.

Hard rules:
- Never invent prices, award availability, transfer ratios, card benefits or credit amounts. Every number you state must come from a tool result in this conversation.
- Use optimize_trip for any trip plan or "which card/points should we use" question. Use calculate_redemption for any cents-per-point math. Do not do financial arithmetic yourself.
- PerkPilot's travel prices are demo estimates and award availability is never confirmed. Say so briefly when you quote prices.
- Card rules carry a verification status. If a rule is unverified, say it should be confirmed at the official source.
- Points are owned per traveler. Only say points can be combined when the pooling rules from get_household_summary allow it.
- Never claim to transfer points or book anything. Point transfers are irreversible — always advise confirming award space first.
- Don't encourage purchases just to use up a credit.
- If a destination isn't in list_destinations, say PerkPilot doesn't have data for it yet and suggest the closest available ones.
- Pick reasonable defaults (2 adults, home airport, dates in the requested season) rather than asking many questions; mention the assumptions.

Style: short paragraphs and tight bullet lists in Markdown. Lead with the recommendation, then the why, then the trade-offs between the three strategies (Maximum Savings, Balanced Value, Maximum Luxury). End with one clear next step.${tripContext ? `\n\nThe user is looking at this saved trip:\n${tripContext}` : ""}`;
}

export async function runConcierge(history: ChatTurn[], ctx: ToolContext, tripContext?: string, opts: { allowLlm?: boolean; denyReason?: "not_enabled" | "user_limit" } = {}): Promise<{ text: string; mode: "llm" | "deterministic"; model?: string }> {
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!process.env.ANTHROPIC_API_KEY || opts.allowLlm === false) {
    const note = !process.env.ANTHROPIC_API_KEY
      ? ""
      : opts.denyReason === "not_enabled"
        ? "\n\n_(The AI concierge isn't enabled for your account, so this answer used PerkPilot's free deterministic mode. The account owner can turn AI on for you.)_"
        : opts.denyReason === "user_limit"
          ? "\n\n_(You've reached today's AI concierge allowance, so this answer used deterministic mode. It resets at midnight UTC.)_"
          : "\n\n_(The AI concierge's daily usage limit was reached, so this answer used deterministic mode.)_";
    return { text: (await fallbackConcierge(lastUser, ctx)) + note, mode: "deterministic" };
  }

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: systemPrompt(ctx.today, tripContext),
        tools: TOOL_DEFINITIONS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return { text: "I can't help with that request. I'm happy to help plan a trip or explain your card benefits.", mode: "llm", model: MODEL };
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { text: text || "I couldn't produce an answer — please try rephrasing.", mode: "llm", model: MODEL };
      }
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (t) => {
          try {
            const out = await runTool(t.name, t.input, ctx);
            const json = JSON.stringify(out);
            return { type: "tool_result" as const, tool_use_id: t.id, content: json.length > MAX_TOOL_RESULT_CHARS ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…(truncated)` : json };
          } catch (e) {
            return { type: "tool_result" as const, tool_use_id: t.id, content: `Tool error: ${(e instanceof Error ? e.message : String(e)).slice(0, 500)}`, is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
    return { text: "That took more steps than expected. Here's what I could put together — try asking a narrower question.", mode: "llm", model: MODEL };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("[concierge] rate limited; using deterministic mode");
    else if (e instanceof Anthropic.APIError) console.error(`[concierge] API error ${e.status}`, e.message);
    else console.error("[concierge] unexpected error", e);
    const text = await fallbackConcierge(lastUser, ctx);
    return { text: `${text}\n\n_(The AI model was unavailable, so this answer used deterministic mode.)_`, mode: "deterministic" };
  }
}
