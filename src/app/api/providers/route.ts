import { providerCatalogue } from "@/lib/providers/registry";
import { dbConfigured } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    providers: providerCatalogue(),
    llm: { configured: Boolean(process.env.ANTHROPIC_API_KEY), model: process.env.PERKPILOT_LLM_MODEL ?? "claude-opus-5-5" },
    database: { configured: dbConfigured() },
    sync: { configured: Boolean(process.env.PERKPILOT_SYNC_TOKEN) && dbConfigured() },
  });
}
