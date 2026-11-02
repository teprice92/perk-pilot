/**
 * Only allow http(s) links in rendered hrefs. Booking/verification URLs can
 * come from third-party providers, imported backups or synced snapshots, so
 * they are treated as untrusted: anything else (javascript:, data:, vbscript:,
 * relative tricks) is dropped.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
