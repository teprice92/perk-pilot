import { loadRules } from "@/lib/server/rules-db";

export const runtime = "nodejs";

export async function GET() {
  const rules = await loadRules();
  return Response.json(rules, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
