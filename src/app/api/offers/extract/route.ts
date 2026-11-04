import { z } from "zod";
import { extractOffers, OfferExtractionError } from "@/lib/offers/extract";
import { aiAccess, recordAiUse } from "@/lib/server/auth/ai";
import { requireUser } from "@/lib/server/auth/guard";
import { clientKey, consumeDailyBudget, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";
export const maxDuration = 120;

// Vercel caps request bodies at ~4.5 MB; the app downsizes screenshots before upload.
const MAX_BODY = 4 * 1024 * 1024;
const DAILY_LLM_LIMIT = Math.max(0, Number(process.env.CONCIERGE_DAILY_LIMIT ?? 300));

const Body = z
  .object({
    cardName: z.string().min(2).max(120),
    images: z.array(z.object({ mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), data: z.string().min(100).max(3_000_000).regex(/^[A-Za-z0-9+/=]+$/) })).max(4).optional(),
    text: z.string().min(20).max(30_000).optional(),
  })
  .refine((b) => (b.images?.length ?? 0) > 0 || b.text, { message: "Add a screenshot or paste the offer text" });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const rl = rateLimit(clientKey(req, "offers"), 10);
    if (!rl.ok) return tooMany(rl.resetAt);
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "Reading offers needs the AI concierge (ANTHROPIC_API_KEY isn't set). You can still add offers by hand.");
    const access = await aiAccess(user);
    if (!access.allowed) throw new HttpError(403, access.reason === "not_enabled" ? "AI isn't enabled for your account — ask the owner, or add offers by hand." : "You've reached today's AI allowance. It resets at midnight UTC.");
    if (!consumeDailyBudget("concierge-llm", DAILY_LLM_LIMIT)) throw new HttpError(429, "The daily AI limit was reached. Try again tomorrow.");
    const parsed = Body.safeParse(await readJson(req, MAX_BODY));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 422 });
    const today = new Date().toISOString().slice(0, 10);
    try {
      const offers = await extractOffers({ ...parsed.data, today });
      await recordAiUse(user);
      return Response.json({ offers }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof OfferExtractionError) throw new HttpError(422, e.message);
      throw e;
    }
  } catch (e) {
    return errorResponse(e, "Couldn't read the offers right now");
  }
}
