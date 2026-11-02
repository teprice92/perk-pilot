import { z } from "zod";
import { runConcierge } from "@/lib/ai/orchestrator";
import { BenefitOverrideSchema, BenefitUsageSchema, HouseholdSchema } from "@/lib/domain/schemas";
import { RulesRepository } from "@/lib/rules/repository";
import { clientKey, consumeDailyBudget, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/server/request";
import { loadRules } from "@/lib/server/rules-db";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(20),
  household: HouseholdSchema,
  usage: z.array(BenefitUsageSchema).max(500).default([]),
  overrides: z.array(BenefitOverrideSchema).max(500).default([]),
  tripContext: z.string().max(6000).optional(),
});

const MAX_BODY = 256 * 1024;
/** Max LLM-backed conversations per instance per UTC day (cost ceiling). */
const DAILY_LLM_LIMIT = Math.max(0, Number(process.env.CONCIERGE_DAILY_LIMIT ?? 300));

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const rl = rateLimit(clientKey(req, "concierge"), Math.max(5, Math.floor(Number(process.env.RATE_LIMIT_PER_MINUTE ?? 30) / 2)));
    if (!rl.ok) return tooMany(rl.resetAt);
    const parsed = Body.safeParse(await readJson(req, MAX_BODY));
    if (!parsed.success) return Response.json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
    const { messages, household, usage, overrides, tripContext } = parsed.data;
    if (messages[messages.length - 1]!.role !== "user") return Response.json({ error: "Last message must be from the user" }, { status: 422 });
    const today = new Date().toISOString().slice(0, 10);
    const rules = new RulesRepository(await loadRules(), today, overrides);
    const ctx = { household, usage, rules, today, results: [] };
    // Over the daily ceiling, answer in deterministic mode instead of calling the LLM.
    const allowLlm = Boolean(process.env.ANTHROPIC_API_KEY) && consumeDailyBudget("concierge-llm", DAILY_LLM_LIMIT);
    const out = await runConcierge(messages, ctx, tripContext, { allowLlm });
    return Response.json({ ...out, trips: ctx.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "The concierge is unavailable right now");
  }
}
