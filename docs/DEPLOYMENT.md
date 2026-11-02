# Deploying PerkPilot

PerkPilot is a standard Next.js 16 app. Its API routes use the Node.js runtime.

## Vercel (simplest)

1. Import the `teprice92/perk-pilot` repository (the app is at the repository root).
2. Build command: `npm run build`. This runs `prisma generate && next build`.
3. Environment variables (all optional; see `.env.example`): `ANTHROPIC_API_KEY`, `PERKPILOT_LLM_MODEL`, `DATABASE_URL`, `PERKPILOT_SYNC_TOKEN`, `PERKPILOT_ADMIN_TOKEN`, `DUFFEL_ACCESS_TOKEN`, `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AMADEUS_ENV`, `SEATS_AERO_API_KEY`, `GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PERKPILOT_LIVE_FLIGHTS`, `PERKPILOT_LIVE_HOTELS`, `PERKPILOT_LIVE_AWARDS`, `PERKPILOT_LIVE_EXPERIENCES`, `RATE_LIMIT_PER_MINUTE`, `TRUSTED_PROXY_HOPS`, `CONCIERGE_DAILY_LIMIT`, `ALLOWED_ORIGINS`, `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION`.
4. For a database, use any managed Postgres (Neon, Supabase, RDS, Vercel Postgres). Then run once from your machine:
   ```bash
   DATABASE_URL=... npx prisma db push
   DATABASE_URL=... npm run db:seed
   ```
5. The concierge route sets `maxDuration = 120`. Make sure your plan allows functions to run that long.

## Self-hosting (Docker or a VM)

```bash
git clone https://github.com/teprice92/perk-pilot.git && cd perk-pilot
npm ci
npm run build
NODE_ENV=production npm start   # listens on :3000
```

Put it behind HTTPS (Caddy, nginx or a load balancer). Service workers and PWA installation require HTTPS outside localhost.

`docker-compose.yml` includes a Postgres service for local development. In production, use a managed database or a backed-up volume.

## Production checklist

- [ ] HTTPS enabled; `PERKPILOT_SYNC_TOKEN` and `PERKPILOT_ADMIN_TOKEN` are at least 32 random characters (shorter tokens are rejected)
- [ ] `TRUSTED_PROXY_HOPS` matches your proxy chain (Vercel or one reverse proxy = 1; directly exposed = 0) so rate limits can't be bypassed with spoofed `X-Forwarded-For`
- [ ] `CONCIERGE_DAILY_LIMIT` set, **and** a monthly spend limit configured in the Anthropic Console as a hard backstop
- [ ] Read [SECURITY.md](../SECURITY.md)
- [ ] `RATE_LIMIT_PER_MINUTE` tuned. The in-memory limiter is per instance; for several instances, swap `src/lib/server/rate-limit.ts` for a Redis or Upstash implementation.
- [ ] Rules database seeded, and each rule verified against its source URL, with `verification` and `lastVerified` updated
- [ ] Live providers enabled only after working through the checklist in [PROVIDERS.md](PROVIDERS.md); `PERKPILOT_ADMIN_TOKEN` is at least 32 random characters and rules have been verified through `/api/admin/verify`
- [ ] Map tiles point to a provider whose usage policy fits your traffic
- [ ] Error monitoring (for example Sentry) wired into `src/app/error.tsx` and the API routes
- [ ] If you change `public/sw.js`, bump its `VERSION` so clients pick up the new cache

## Installing as an app

- **Android / Chrome / Edge:** open the site and choose *Install app*.
- **iOS / iPadOS Safari:** Share → *Add to Home Screen*. Notifications for expiring credits require iOS 16.4+ with the app installed to the home screen.
