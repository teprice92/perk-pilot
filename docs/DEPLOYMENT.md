# Deploying PerkPilot

PerkPilot is a standard Next.js 16 app. Its API routes use the Node.js runtime.

## Vercel (simplest)

1. Import the repository and set **Root Directory** to `perkpilot`.
2. Build command: `npm run build`. This runs `prisma generate && next build`.
3. Environment variables (all optional): `ANTHROPIC_API_KEY`, `PERKPILOT_LLM_MODEL`, `DATABASE_URL`, `PERKPILOT_SYNC_TOKEN`, `DUFFEL_ACCESS_TOKEN`, `PERKPILOT_LIVE_FLIGHTS`, `RATE_LIMIT_PER_MINUTE`, `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION`.
4. For a database, use any managed Postgres (Neon, Supabase, RDS, Vercel Postgres). Then run once from your machine:
   ```bash
   DATABASE_URL=... npx prisma db push
   DATABASE_URL=... npm run db:seed
   ```
5. The concierge route sets `maxDuration = 120`. Make sure your plan allows functions to run that long.

## Self-hosting (Docker or a VM)

```bash
cd perkpilot
npm ci
npm run build
NODE_ENV=production npm start   # listens on :3000
```

Put it behind HTTPS (Caddy, nginx or a load balancer). Service workers and PWA installation require HTTPS outside localhost.

`docker-compose.yml` includes a Postgres service for local development. In production, use a managed database or a backed-up volume.

## Production checklist

- [ ] HTTPS enabled; `PERKPILOT_SYNC_TOKEN` is at least 32 random characters if sync is used
- [ ] `RATE_LIMIT_PER_MINUTE` tuned. The in-memory limiter is per instance; for several instances, swap `src/lib/server/rate-limit.ts` for a Redis or Upstash implementation.
- [ ] Rules database seeded, and each rule verified against its source URL, with `verification` and `lastVerified` updated
- [ ] Live providers enabled only after working through the checklist in [PROVIDERS.md](PROVIDERS.md)
- [ ] Map tiles point to a provider whose usage policy fits your traffic
- [ ] Error monitoring (for example Sentry) wired into `src/app/error.tsx` and the API routes
- [ ] If you change `public/sw.js`, bump its `VERSION` so clients pick up the new cache

## Installing as an app

- **Android / Chrome / Edge:** open the site and choose *Install app*.
- **iOS / iPadOS Safari:** Share → *Add to Home Screen*. Notifications for expiring credits require iOS 16.4+ with the app installed to the home screen.
