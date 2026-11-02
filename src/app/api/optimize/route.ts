import { OptimizeBodySchema } from "@/lib/domain/schemas";
import { optimizeTrip } from "@/lib/optimizer/engine";
import { RulesRepository } from "@/lib/rules/repository";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";
import { loadRules } from "@/lib/server/rules-db";

export const runtime = "nodejs";

const MAX_BODY = 256 * 1024;

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const rl = rateLimit(clientKey(req, "optimize"));
    if (!rl.ok) return tooMany(rl.resetAt);
    const parsed = OptimizeBodySchema.safeParse(await readJson(req, MAX_BODY));
    if (!parsed.success) {
      return Response.json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
    }
    const { request, household, usage, overrides } = parsed.data;
    const today = new Date().toISOString().slice(0, 10);
    const rules = new RulesRepository(await loadRules(), today, overrides);
    try {
      const result = await optimizeTrip({ request, household, rules, usage });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      // Only known, user-facing engine messages are returned verbatim.
      const message = e instanceof Error ? e.message : "";
      if (message.startsWith("Unknown destination")) throw new HttpError(404, message);
      if (message.startsWith("No bookable options")) throw new HttpError(422, message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e, "Optimization failed");
  }
}
