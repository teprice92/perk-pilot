/**
 * Fetch an official page and reduce it to readable text for change detection.
 * Issuer sites often block servers or render with JavaScript; callers treat a
 * short or failed result as "blocked" and can fall back to Claude's web fetch
 * or text pasted by the owner.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", reg: "®", trade: "™", copy: "©", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Normalise text so cosmetic changes (whitespace, dates in footers) don't count as changes. */
export function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/©\s*\d{4}.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const MAX_PAGE_CHARS = 200_000;
/** Below this much readable text the page is almost certainly a JavaScript shell or a block page. */
export const MIN_PAGE_CHARS = 1_500;

export type PageResult = { ok: true; text: string; truncated: boolean } | { ok: false; reason: string };

export async function fetchPageText(url: string): Promise<PageResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PerkPilot benefits watcher; personal use)", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false, reason: `Couldn't reach the page (${e instanceof Error ? e.message : "network error"})` };
  }
  if (!res.ok) return { ok: false, reason: `The site answered ${res.status}${res.status === 403 ? " (blocks automated requests)" : ""}` };
  const type = res.headers.get("content-type") ?? "";
  if (!/html|text/.test(type)) return { ok: false, reason: `Unexpected content type ${type || "unknown"}` };
  const html = (await res.text()).slice(0, 3_000_000);
  const text = htmlToText(html);
  if (text.length < MIN_PAGE_CHARS) return { ok: false, reason: "The page needs JavaScript or a login to show its content" };
  return { ok: true, text: text.slice(0, MAX_PAGE_CHARS), truncated: text.length > MAX_PAGE_CHARS };
}
