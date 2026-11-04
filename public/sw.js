/* PerkPilot service worker — offline access to saved trips and the app shell.
 * Household data and trips live in IndexedDB; this worker caches the code and
 * pages needed to render them without a network connection. */
const VERSION = "pp-v4";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const TILES = `${VERSION}-tiles`;
const PAGES = ["/", "/trips", "/trip", "/wallet", "/benefits", "/settings", "/concierge", "/account", "/offline"];
const ASSETS = ["/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        Promise.allSettled(
          [...PAGES, ...ASSETS].map(async (u) => {
            const res = await fetch(new Request(u, { cache: "reload", credentials: "same-origin" }));
            // With logins on, signed-out precache requests redirect to /login — never store those as app pages.
            if (res.ok && !res.redirected) await cache.put(u, res);
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Map tiles: cache-first (respect provider usage policies; bounded cache).
  if (/tile\.openstreetmap\.org|basemaps\.cartocdn\.com/.test(url.hostname)) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") {
            cache.put(req, res.clone());
            trim(TILES, 400);
          }
          return res;
        } catch {
          return Response.error();
        }
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Never cache API calls except the rules dataset (stale-while-revalidate).
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/rules") {
      event.respondWith(
        caches.open(RUNTIME).then(async (cache) => {
          const hit = await cache.match(req);
          const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || network;
        }),
      );
    }
    return;
  }

  // Hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/_next/image")) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // RSC payloads for client navigation: network only. On failure Next.js falls
  // back to a full navigation, which is served from the page cache below.
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  // Page navigations: network-first, fall back to the cached page (ignoring
  // query strings so /trip?id=… works offline), then the offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected && !["/login", "/signup"].includes(url.pathname)) {
            const cache = await caches.open(SHELL);
            cache.put(url.pathname, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(url.pathname)) || (await cache.match(req, { ignoreSearch: true })) || (await cache.match("/offline")) || Response.error();
        }
      })(),
    );
  }
});
