import { requireUser } from "@/lib/server/auth/guard";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/server/request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user) throw new HttpError(404, "Not found");
    const passkeys = await getDb()!.passkey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, createdAt: true, lastUsedAt: true, backedUp: true, deviceType: true } });
    return Response.json({ passkeys }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Remove one of your passkeys (never the last one, so you can't lock yourself out). */
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    if (!user) throw new HttpError(404, "Not found");
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const db = getDb()!;
    const count = await db.passkey.count({ where: { userId: user.id } });
    if (count <= 1) throw new HttpError(409, "You can't remove your only passkey");
    const res = await db.passkey.deleteMany({ where: { id, userId: user.id } });
    if (!res.count) throw new HttpError(404, "Passkey not found");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
