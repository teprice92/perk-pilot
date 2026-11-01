/** Tiny TTL cache for provider responses (per server instance). */
const store = new Map<string, { value: unknown; expires: number }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expires: Date.now() + ttlMs });
  if (store.size > 500) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires < now) store.delete(k);
  }
  return value;
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
