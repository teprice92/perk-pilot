import { z } from "zod";
import { requireUser } from "@/lib/server/auth/guard";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, errorResponse, HttpError, readJson } from "@/lib/server/request";

export const runtime = "nodejs";

const Body = z.object({ name: z.string().trim().min(1).max(60) });

export async function PATCH(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    if (!user) throw new HttpError(404, "Not found");
    const parsed = Body.safeParse(await readJson(req, 2048));
    if (!parsed.success) throw new HttpError(422, "Please enter a name");
    await getDb()!.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
