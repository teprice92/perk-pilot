import { z } from "zod";
import { relyingParty } from "@/lib/server/auth/config";
import { requireOwner } from "@/lib/server/auth/guard";
import { newToken, sha256 } from "@/lib/server/auth/tokens";
import { getDb } from "@/lib/server/db";
import { clientKey, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireOwner(req);
    const invites = await getDb()!.invite.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return Response.json(
      { invites: invites.map((i) => ({ id: i.id, note: i.note, aiEnabled: i.aiEnabled, joinHousehold: i.joinHousehold, expiresAt: i.expiresAt, usedAt: i.usedAt, createdAt: i.createdAt })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({ note: z.string().trim().max(80).optional(), aiEnabled: z.boolean().default(false), joinHousehold: z.boolean().default(false), days: z.number().int().min(1).max(30).default(7) });

/** Create an invite. The code is returned once and only its hash is stored. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const owner = await requireOwner(req);
    const rl = rateLimit(clientKey(req, "admin"), 30);
    if (!rl.ok) return tooMany(rl.resetAt);
    const parsed = Body.safeParse(await readJson(req, 2048));
    if (!parsed.success) throw new HttpError(422, "Invalid request");
    const code = newToken(24);
    const inv = await getDb()!.invite.create({
      data: { codeHash: sha256(code), createdById: owner.id, note: parsed.data.note || null, aiEnabled: parsed.data.aiEnabled, joinHousehold: parsed.data.joinHousehold, expiresAt: new Date(Date.now() + parsed.data.days * 86_400_000) },
    });
    return Response.json({ id: inv.id, link: `${relyingParty(req).origin}/signup?invite=${code}`, expiresAt: inv.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    await requireOwner(req);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    await getDb()!.invite.deleteMany({ where: { id, usedAt: null } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
