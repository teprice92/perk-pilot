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
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

/**
 * Client IP for rate limiting.
 *
 * `X-Forwarded-For` is a list the client can pre-fill with anything; only the
 * entries appended by YOUR proxies are trustworthy. We therefore take the entry
 * `TRUSTED_PROXY_HOPS` positions from the right (default 1 = the address your
 * edge proxy saw — correct for Vercel and a single nginx/Caddy/load balancer).
 * Set TRUSTED_PROXY_HOPS=0 when the app is exposed directly with no proxy: all
 * forwarding headers are then ignored and clients share one bucket.
 */
export function clientIp(req: Request): string {
  const hops = Math.max(0, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 1)));
  if (hops === 0) return "direct";
  const list = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length >= hops) return list[list.length - hops]!;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function clientKey(req: Request, scope: string): string {
  return `${scope}:${clientIp(req)}`;
}

export function tooMany(resetAt: number) {
  return Response.json(
    { error: "Too many requests — please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } },
  );
}

/**
 * Per-instance daily ceiling for paid upstream calls (e.g. the LLM), so a
 * distributed burst can't run up an unbounded bill even if per-IP limits are
 * evaded. Resets at UTC midnight.
 */
const daily = new Map<string, { day: string; count: number }>();

export function consumeDailyBudget(scope: string, limit: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const cur = daily.get(scope);
  if (!cur || cur.day !== day) {
    daily.set(scope, { day, count: 1 });
    return limit >= 1;
  }
  if (cur.count >= limit) return false;
  cur.count++;
  return true;
}
