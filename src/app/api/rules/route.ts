import { requireUser } from "@/lib/server/auth/guard";
import { errorResponse } from "@/lib/server/request";
import { loadRules } from "@/lib/server/rules-db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireUser(req);
  } catch (e) {
    return errorResponse(e);
  }
  const rules = await loadRules();
  return Response.json(rules, { headers: { "Cache-Control": "private, max-age=300" } });
}
