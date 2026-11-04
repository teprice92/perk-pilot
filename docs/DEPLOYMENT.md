# Deploying PerkPilot

PerkPilot is a standard Next.js 16 app. Its API routes use the Node.js runtime.

## Vercel (simplest)

1. Import the `teprice92/perk-pilot` repository (the app is at the repository root).
2. Build command: `npm run build`. This runs `prisma generate && next build`.
3. Environment variables (all optional; see `.env.example`): `ANTHROPIC_API_KEY`, `PERKPILOT_LLM_MODEL`, `DATABASE_URL`, `PERKPILOT_SYNC_TOKEN`, `PERKPILOT_ADMIN_TOKEN`, `DUFFEL_ACCESS_TOKEN`, `SEATS_AERO_API_KEY`, `GOOGLE_PLACES_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PERKPILOT_LIVE_FLIGHTS`, `PERKPILOT_LIVE_AWARDS`, `PERKPILOT_LIVE_HOTEL_AWARDS`, `PERKPILOT_LIVE_EXPERIENCES`, `RATE_LIMIT_PER_MINUTE`, `TRUSTED_PROXY_HOPS`, `CONCIERGE_DAILY_LIMIT`, `ALLOWED_ORIGINS`, `PERKPILOT_AUTH`, `AUTH_SECRET`, `PERKPILOT_SETUP_CODE`, `PERKPILOT_SIGNUP`, `PERKPILOT_ORIGIN`, `CONCIERGE_USER_DAILY_LIMIT`, `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION`.
4. For a database, use any managed Postgres (Neon, Supabase, RDS, Vercel Postgres). Then run once from your machine:
   ```bash
   DATABASE_URL=... npx prisma db push
   DATABASE_URL=... npm run db:seed
   ```
5. The concierge route sets `maxDuration = 120`. Make sure your plan allows functions to run that long.

## Accounts and AI access

Turn on passkey sign-in to limit who can use your deployment and whose concierge questions use your Anthropic key.

1. **Database:** in Vercel → Storage, create a Postgres database (for example Neon) and connect it to the project. This sets `DATABASE_URL`. Then create the tables once from your machine:
   ```bash
   npm install
   DATABASE_URL="…" npx prisma db push
   DATABASE_URL="…" npm run db:seed
   ```
2. **Environment variables** (Vercel → Settings → Environment Variables):
   | Variable | Value |
   |---|---|
   | `PERKPILOT_AUTH` | `passkey` |
   | `AUTH_SECRET` | output of `openssl rand -base64 48` |
   | `PERKPILOT_SETUP_CODE` | any private code of 16+ characters (used once) |
   | `PERKPILOT_ORIGIN` | your final URL, e.g. `https://perkpilot.vercel.app` |
   | `ANTHROPIC_API_KEY` | your key (optional, for the AI concierge) |
   | `CONCIERGE_USER_DAILY_LIMIT` | AI conversations per enabled person per day (default 30) |
   | `CRON_SECRET` | random 16+ characters — enables the weekly benefits watcher |
3. **Redeploy**, open the site and choose **Create the owner account**. Enter your name and the setup code, then save the passkey (Face ID, Touch ID, Windows Hello or a phone). You're now the owner.
4. **Invite people** from **Account → Manage users** (`/admin`). For your spouse, leave **Share my household** on, so you share cards, balances and saved trips, synced automatically. Turn **Enable AI concierge** on only for people whose usage you're willing to pay for. Send the one-time link privately.
5. You can switch AI on or off per person, see each person's AI use today and this month, and disable or remove accounts at any time. People without AI still get the free built-in planner.

Notes:

- **Passkeys are tied to the domain.** Pick your final domain (`PERKPILOT_ORIGIN`) before anyone signs up. Moving domains means everyone registers a new passkey.
- **Add a passkey on each device** (Account → Add a passkey), unless the passkey syncs through iCloud Keychain or Google Password Manager.
- **Owner recovery:** if the owner loses every passkey, an administrator with database access can delete that user's rows. The setup code then works again only if no owner remains.
- `PERKPILOT_SIGNUP=open` lets anyone create an account (AI off by default). The default, `invite`, is recommended.
- With logins on, the old shared `PERKPILOT_SYNC_TOKEN` isn't used; each person syncs the household they belong to.

## Benefits watcher and card offers

**Benefits watcher** (owner only, Admin page). Every Monday at 13:00 UTC a scheduled job checks the official Amex Platinum, Sapphire Reserve, Membership Rewards and Ultimate Rewards pages. When a page changed, Claude compares it with PerkPilot's rules and lists each difference, with a quote from the page, under **Changes to review**. Approving a change updates the rules database and the audit log; nothing changes without approval.

- Needs `DATABASE_URL` with the tables created **and seeded** (`npx prisma db push` then `npm run db:seed`). Approvals are refused on an empty rules database.
- Set `CRON_SECRET` (any random string of 16+ characters) in Vercel. Vercel Cron sends it automatically to `/api/cron/watch` (schedule in `vercel.json`). Without it the weekly job does nothing, but **Check all now** still works.
- Unchanged pages cost nothing — the AI review only runs when a page's text changed. Issuer sites often block servers; then Claude fetches the page itself (each weekly review of a blocked page uses some AI), or you can turn that off per page and use **Paste text** instead.
- You can add other official pages (for example a benefits terms page) and edit or remove the defaults.

**Card offers** (everyone, Benefits → Offers). Import Amex Offers and Chase Offers from screenshots of the issuer app or pasted offer emails; Claude reads them and you choose which to keep. Offers sync with the household, show expiry reminders, and appear on trips whose hotel or airline matches. Reading offers uses the person's AI allowance and requires AI to be enabled for them; anyone can add offers by hand. Screenshots are downsized in the browser, sent to Claude to read, and not stored.

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
- [ ] For anything beyond local use, logins on (`PERKPILOT_AUTH=passkey`) with a strong `AUTH_SECRET`; `PERKPILOT_ORIGIN` set to the final domain
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
