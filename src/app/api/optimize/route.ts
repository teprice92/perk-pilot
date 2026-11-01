import { OptimizeBodySchema } from "@/lib/domain/schemas";
import { optimizeTrip } from "@/lib/optimizer/engine";
import { RulesRepository } from "@/lib/rules/repository";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { loadRules } from "@/lib/server/rules-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "optimize"));
  if (!rl.ok) return tooMany(rl.resetAt);
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = OptimizeBodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const { request, household, usage, overrides } = parsed.data;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rules = new RulesRepository(await loadRules(), today, overrides);
    const result = await optimizeTrip({ request, household, rules, usage });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Optimization failed";
    return Response.json({ error: message }, { status: message.startsWith("Unknown destination") ? 404 : 500 });
  }
}
