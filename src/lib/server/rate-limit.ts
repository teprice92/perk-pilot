/**
 * Simple fixed-window in-memory rate limiter keyed by client IP.
 * Suitable for a single instance; swap for Redis/Upstash in multi-instance
 * deployments (see docs/DEPLOYMENT.md).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 30), windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:${fwd || req.headers.get("x-real-ip") || "local"}`;
}

export function tooMany(resetAt: number) {
  return Response.json(
    { error: "Too many requests — please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } },
  );
}
