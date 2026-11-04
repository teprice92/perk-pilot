import { requireUser } from "@/lib/server/auth/guard";
import { errorResponse } from "@/lib/server/request";
import { providerCatalogue } from "@/lib/providers/registry";
import { dbConfigured } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireUser(req);
  } catch (e) {
    return errorResponse(e);
  }
  return Response.json({
    providers: providerCatalogue(),
    llm: { configured: Boolean(process.env.ANTHROPIC_API_KEY), model: process.env.PERKPILOT_LLM_MODEL ?? "claude-opus-5-5" },
    database: { configured: dbConfigured() },
    sync: { configured: dbConfigured() && (process.env.PERKPILOT_AUTH === "passkey" || Boolean(process.env.PERKPILOT_SYNC_TOKEN)), automatic: dbConfigured() && process.env.PERKPILOT_AUTH === "passkey" },
    auth: { enabled: process.env.PERKPILOT_AUTH === "passkey" },
  });
}
