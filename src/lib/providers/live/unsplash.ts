import { cached } from "@/lib/server/cache";
import type { ImageResult, ProviderInfo } from "../types";

/**
 * Unsplash destination photography (optional). Requires UNSPLASH_ACCESS_KEY.
 * Per the API guidelines, images are hotlinked and the photographer + Unsplash
 * are credited with UTM-tagged links wherever the photo is shown.
 */
const UTM = "utm_source=perkpilot&utm_medium=referral";

export function unsplashInfo(): ProviderInfo {
  return {
    id: "unsplash",
    name: "Unsplash (destination photography)",
    category: "images",
    configured: Boolean(process.env.UNSPLASH_ACCESS_KEY),
    dataKind: "live",
    docsUrl: "https://unsplash.com/documentation",
    notes: "Hero photography with required photographer attribution. Without it, PerkPilot shows generative postcard art.",
    envVars: ["UNSPLASH_ACCESS_KEY"],
  };
}

interface UnsplashPhoto {
  urls: { regular: string; small: string };
  alt_description?: string | null;
  user: { name: string; links: { html: string } };
  links: { html: string };
}

export function mapUnsplash(p: UnsplashPhoto, query: string): ImageResult {
  return {
    url: p.urls.regular,
    thumbUrl: p.urls.small,
    alt: p.alt_description ?? query,
    photographer: p.user.name,
    photographerUrl: `${p.user.links.html}?${UTM}`,
    sourceUrl: `${p.links.html}?${UTM}`,
    source: "Unsplash",
  };
}

export async function searchDestinationPhoto(query: string): Promise<ImageResult | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  return cached(`unsplash:${query}`, 24 * 3600_000, async () => {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", "1");
    url.searchParams.set("content_filter", "high");
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    const json = (await res.json()) as { results?: UnsplashPhoto[] };
    const p = json.results?.[0];
    return p ? mapUnsplash(p, query) : null;
  });
}
