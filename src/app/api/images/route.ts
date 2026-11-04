import { requireUser } from "@/lib/server/auth/guard";
import { errorResponse } from "@/lib/server/request";
import { destinationById } from "@/lib/providers/demo/catalog";
import { searchDestinationPhoto } from "@/lib/providers/live/unsplash";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/** Destination photo with required attribution, or 204 when not configured. */
export async function GET(req: Request) {
  try {
    await requireUser(req);
  } catch (e) {
    return errorResponse(e);
  }
  const rl = rateLimit(clientKey(req, "images"), 120);
  if (!rl.ok) return tooMany(rl.resetAt);
  const id = new URL(req.url).searchParams.get("destination") ?? "";
  const dest = destinationById(id);
  if (!dest) return Response.json({ error: "Unknown destination" }, { status: 404 });
  if (!process.env.UNSPLASH_ACCESS_KEY) return new Response(null, { status: 204 });
  try {
    const photo = await searchDestinationPhoto(`${dest.name} ${dest.country} travel`);
    if (!photo) return new Response(null, { status: 204 });
    return Response.json(photo, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response(null, { status: 204 });
  }
}
