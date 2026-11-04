import { authEnabled, signupMode } from "@/lib/server/auth/config";
import { getSessionUser } from "@/lib/server/auth/session";
import { getDb } from "@/lib/server/db";

export const runtime = "nodejs";

/** Public: tells the client whether logins are on and who is signed in. */
export async function GET(req: Request) {
  if (!authEnabled()) return Response.json({ authEnabled: false, user: null }, { headers: { "Cache-Control": "no-store" } });
  const db = getDb();
  const configured = Boolean(db) && (process.env.AUTH_SECRET ?? "").length >= 32;
  if (!configured) return Response.json({ authEnabled: true, misconfigured: true, user: null }, { status: 503 });
  const user = await getSessionUser(req).catch(() => null);
  const needsSetup = user ? false : (await db!.user.count({ where: { role: "owner" } })) === 0;
  return Response.json(
    { authEnabled: true, user: user && { id: user.id, name: user.name, email: user.email, role: user.role, aiEnabled: user.aiEnabled, householdId: user.householdId }, needsSetup, signup: signupMode(), syncAvailable: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
