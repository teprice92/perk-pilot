# PerkPilot

**Travel smarter. Experience more.**

PerkPilot is a mobile-first web app that plans trips around a household's credit card rewards. You enter a destination, dates and travelers; it compares cash fares, award flights, transfer partners, hotel programs and card credits across the household's **American Express Platinum** and **Chase Sapphire Reserve**, then returns three plans you can book: **Maximum Savings**, **Balanced Value** and **Maximum Luxury**.

> Tell us where you want to go. We'll figure out how to make your points take you further.

---

## What works today

| Area | Status |
|---|---|
| Trip search (destination, dates, ±3 flexible days, travelers, cabin, style) | ✅ |
| Deterministic rewards engine (cents per point, transfers, bonuses, credits, pooling) | ✅ tested |
| Three strategies with a side-by-side comparison and a recommended plan | ✅ |
| Flight, hotel and experience comparison screens | ✅ |
| Day-by-day itinerary with drag-and-drop, map, re-optimization and booking status | ✅ |
| Household rewards wallet (two travelers, cards, AU status, balances, loyalty, elite status) | ✅ |
| Benefits & credit tracker (usage, enrollment, expirations, reminders, rule edits, history) | ✅ |
| Saved trips, available offline | ✅ |
| AI concierge (Claude with verified tools, plus a deterministic fallback) | ✅ |
| Installable PWA with an offline indicator | ✅ |
| Live cash fares (Duffel adapter, opt-in) | ✅ adapter + tests (needs your token) |
| Live award availability, hotel pricing and experiences | 🧭 adapter contracts and docs ([docs/PROVIDERS.md](docs/PROVIDERS.md)) |
| Multi-user authentication | 🧭 single-household sync token today ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#authentication)) |

### Honesty rules built in

- **Demo data is always labelled.** Every price shows whether it is *live*, *cached* or a *demo estimate*. Award availability is never shown as confirmed.
- **Card rules are data, not code.** Benefits, transfer ratios and portal rates live in a date-effective rules dataset. Each rule carries a source URL, a last-verified date and a verification status. The starter dataset ships as **unverified**, and sample transfer bonuses are marked **demo**.
- **The AI does no math.** The concierge has to call the deterministic engine for prices, cents per point and benefits, and the system prompt forbids inventing them.
- **Nothing irreversible happens automatically.** PerkPilot never transfers points or books travel. It gives step-by-step instructions and links to verify first.
- **No credentials are stored.** PerkPilot never asks for card numbers or passwords, and keeps only the last 4 characters of a loyalty member number.

---

## Quick start

Requirements: **Node.js 20.9+** (22 LTS recommended) and npm. PostgreSQL is optional.

```bash
cd perkpilot
npm install            # also runs `prisma generate`
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

With no environment variables set, the app runs in **guest demo mode**: a sample household, labelled sample prices, and the deterministic concierge.

### Optional configuration

| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` (+ `PERKPILOT_LLM_MODEL`, default `claude-opus-5-5`) | The AI concierge. It uses server-side fallback on refusals. |
| `DATABASE_URL` | Loading the rules database from PostgreSQL, and household sync |
| `PERKPILOT_SYNC_TOKEN` | Syncing household data between both travelers' devices (self-hosted) |
| `DUFFEL_ACCESS_TOKEN` + `PERKPILOT_LIVE_FLIGHTS=duffel` | Live cash fares |
| `NEXT_PUBLIC_MAP_TILE_URL` | Your own map tile provider (default: OpenStreetMap) |
| `RATE_LIMIT_PER_MINUTE` | API rate limit per client (default 30) |

All keys are server-only. Only variables prefixed `NEXT_PUBLIC_` reach the browser, and the only one is the map tile URL.

### Database (optional)

```bash
docker compose up -d db          # local Postgres 16 on :5432
cp .env.example .env             # Prisma CLI reads .env
npm run db:push                  # create tables
npm run db:seed                  # load the starter rules dataset
```

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Make a production build and serve it |
| `npm test` | Run the Vitest suite: calculations, rules, credits, pooling, optimizer, itinerary, validation, concierge tools, providers |
| `npm run typecheck` | Run TypeScript in strict mode |
| `npm run demo:optimize -- tokyo` | Run the optimizer from the CLI and print all three plans |
| `npm run db:generate` / `db:push` / `db:migrate` / `db:seed` | Prisma workflows |

---

## Project layout

```
perkpilot/
├─ prisma/                 schema.prisma (Postgres), seed.ts
├─ public/                 sw.js (service worker), icons
├─ docs/                   ARCHITECTURE, PROVIDERS, DEPLOYMENT
├─ scripts/                demo-optimize.mts
├─ tests/                  Vitest suites
└─ src/
   ├─ app/                 pages + API routes (Next.js App Router)
   │  ├─ api/optimize      POST trip optimization (Zod validated, rate limited)
   │  ├─ api/concierge     POST AI concierge (tool-use loop)
   │  ├─ api/rules         GET rules dataset (DB or seed)
   │  ├─ api/providers     GET integration status
   │  ├─ api/sync          GET/PUT household snapshot (token)
   │  └─ api/health
   ├─ components/          ui/ (design system), app/ (shell, art, badges), trip/
   └─ lib/
      ├─ domain/           types + Zod schemas
      ├─ rules/            seed dataset + date-effective RulesRepository
      ├─ calc/             cpp, transfers, credits, periods, earn, confidence, money
      ├─ optimizer/        payment options, pooling/balances, strategy engine
      ├─ providers/        adapter contracts, demo providers, live adapters
      ├─ itinerary/        generation, drag/move, re-optimization
      ├─ ai/               tool definitions, Claude orchestrator, deterministic fallback
      ├─ store/            Zustand store persisted to IndexedDB
      └─ server/           db, rules loader, cache, rate limiting
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/PROVIDERS.md](docs/PROVIDERS.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Calculation rules (summary)

- **Cents per point** = (comparable cash cost − award taxes and fees − unavoidable award-only charges) ÷ points × 100. Implemented in `src/lib/calc/cpp.ts` (integer cents) and tested against the dollar form.
- **Transfers** respect the ratio (for example 1:1, 1:2 or 1000:800), transfer increments, minimum transfers and active bonuses. The optimizer counts the bank points actually transferred.
- **Credits** count only the value you can realistically use. A credit must be in effect on the charge date, match the component, booking channel, merchant tags, minimum nights and prepaid requirement, and be enrolled if enrollment is required. Its remaining balance is tracked per period by a ledger, so a credit is never double counted.
- **Perks** are valued only when guaranteed. Breakfast isn't counted when the rate already includes it. Property credits are discounted by a usefulness factor. Upgrades and early check-in are listed but never counted.
- **Pooling.** Points are combined across household members only when the program's rule says `allowed`, for example Chase UR with one household member. Amex MR is never combined. Unknown rules are treated as not combinable.
- **Opportunity cost.** Points used are valued at the household's own baseline valuations, which are editable. Maximum Savings rejects redemptions below the minimum cents per point.
- **Confidence** comes from data freshness, the data source (live, cached or demo), whether award availability is known, and the verification status of the rules a recommendation relies on. Demo data can never score "high".
