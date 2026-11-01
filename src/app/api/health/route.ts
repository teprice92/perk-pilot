export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, service: "perkpilot", time: new Date().toISOString() });
}
