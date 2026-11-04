import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { runWatcher } from "@/lib/watcher/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Weekly benefits check, called by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the job is disabled.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (secret.length < 16 || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) return Response.json({ skipped: "DATABASE_URL is not set" });
  const results = await runWatcher(db);
  return Response.json({ checked: results.length, newProposals: results.reduce((a, r) => a + r.newProposals, 0), results: results.map((r) => ({ status: r.status, newProposals: r.newProposals })) });
}
