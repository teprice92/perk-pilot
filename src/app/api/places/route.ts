import { searchPlaces } from "@/lib/geo/place-search";
import { requireUser } from "@/lib/server/auth/guard";
import { errorResponse } from "@/lib/server/request";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/** Destination search: catalogue destinations plus any city with an airport nearby. */
export async function GET(req: Request) {
  try {
    await requireUser(req);
    const rl = rateLimit(clientKey(req, "places"), 120);
    if (!rl.ok) return tooMany(rl.resetAt);
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const data = await searchPlaces(q);
    return Response.json(data, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    return errorResponse(e);
  }
}
