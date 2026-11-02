# PerkPilot architecture

## Principles

1. **Deterministic core, AI at the edges.** All money and points arithmetic lives in pure, tested TypeScript (`src/lib/calc`, `src/lib/optimizer`). The LLM interprets requests and explains results, and it reaches numbers only through tools.
2. **Rules are data.** Card benefits, transfer partners, bonuses and portal rates are date-effective rows with provenance. To change a rule, add a row with a new `effectiveFrom` instead of editing code.
3. **Provider-agnostic.** Every travel data source implements an adapter contract and stamps its results with `dataKind` (`live` | `cached` | `demo`) and `fetchedAt`.
4. **Local-first.** Household data and trips persist in IndexedDB, so the app works offline and without an account. Server persistence and sync are opt-in.
5. **Nothing irreversible.** The system produces instructions. It never moves points or money.

## Module map

```
            ┌──────────── UI (Next.js App Router, React 19, Tailwind v4, Motion) ───────────┐
            │  pages: / · /trip · /trips · /wallet · /benefits · /concierge · /settings   │
            │  state: Zustand → IndexedDB (household, usage, overrides, trips, settings)  │
            └───────────────┬─────────────────────────────┬──────────────────────────────┘
                            │ POST /api/optimize          │ POST /api/concierge
                            ▼                             ▼
   ┌──────────── Optimizer (src/lib/optimizer) ───────────┐   ┌──── AI orchestration (src/lib/ai) ────┐
   │ options.ts  → payment options per offer              │◀──│ tools.ts: list_destinations,           │
   │ balances.ts → ownership & pooling allocation         │   │  get_household_summary,               │
   │ engine.ts   → strategy search, credit ledger, plans  │   │  get_card_benefits, get_transfer_      │
   └───────┬──────────────────────┬───────────────────────┘   │  options, optimize_trip,               │
           │                      │                           │  calculate_redemption                  │
           ▼                      ▼                           │ orchestrator.ts: Claude tool loop      │
   ┌── Calc (src/lib/calc) ──┐  ┌── Rules (src/lib/rules) ──┐ │ fallback.ts: deterministic intent      │
   │ cpp, transfers, credits │  │ seed.ts (starter data)    │ └────────────────────────────────────────┘
   │ periods, earn, money,   │  │ repository.ts (as-of date,│
   │ confidence              │  │ overrides)                │◀── server/rules-db.ts (Postgres) ◀── prisma/
   └─────────────────────────┘  └───────────────────────────┘
           ▲
   ┌── Providers (src/lib/providers) ──────────────────────────────┐
   │ types.ts: FlightProvider · HotelProvider · ExperienceProvider │
   │ demo/: deterministic, labelled sample data                    │
   │ live/: duffel.ts (cash fares) · seats-aero.ts (scaffold)      │
   │ registry.ts: picks a configured provider, otherwise demo      │
   └───────────────────────────────────────────────────────────────┘
```

## Optimization pipeline

0. **Slots.** `optimizer/slots.ts` turns the request into ordered booking slots: `outbound`, `leg-1…n` (multi-city), `return`, and `hotel`, `hotel-2…` for each stay, each with dates, cities and nights. A single-city trip is exactly outbound, return and hotel.
1. **Fetch** offers per slot: round-trip flights (all destination airports, cabins up to the preferred cabin plus one, the stops filter), one-way inter-city legs, hotels per stay and experiences per city. Awards from a cached source are attached where configured.
2. **Expand** each offer into `PaymentOption`s:
   - Flights: cash direct · portal points (Chase Travel / Amex Travel at the applicable date-effective rate) · existing airline miles · bank → airline transfer, with increments, bonuses and an optional top-up from an existing balance.
   - Hotels: cash direct · FHR / THC / The Edit program bookings (guaranteed perks valued; credits through the ledger) · hotel points held · bank → hotel transfer (5th-night-free modelled for programs that offer it) · portal points.
3. **Prune** per strategy: keep the overall top *k*, plus the best three per funding source, so the combination search can trade points between components when balances bind.
4. **Search** every combination when the space is small (at most 30k, which covers single-city trips). Otherwise run a **beam search** that keeps the 160 best feasible partial plans, filling hotels first, then flights. For each candidate:
   - Check **feasibility** with `householdBalances.allocate()`, which honours pooling rules.
   - Apply **credits** through a cloned `CreditLedger`, hotel first so program-specific credits match before generic travel credits.
   - **Score**:
     - *Savings*: `cash + 0.05·pointsValue` (options below the minimum cents per point are removed).
     - *Balanced*: `cash + pointsValue − perks − 0.6·comfort`.
     - *Luxury*: `−(comfort + perks) + 0.2·(cash + pointsValue)`, with a steep penalty over budget.
5. **Plan experiences** per strategy (style match, rating and price sensitivity; no premium experiences in Savings, two in Balanced). Apply only credits whose merchant tags match.
6. **Assemble** the plan: totals, premium-cabin upgrade analysis (marginal cash, points and cents per point of the next cabin on the same flight, judged against the comfort settings), balances before and after, explicit transfer instructions, household combine steps, unlocked benefits (credits, guaranteed and availability-dependent perks, lounges, protections, bonuses), the rationale comparing against the best alternative, warnings and confidence.

## Phase 4 features

- **Flexible dates:** `optimizeTrip()` fully re-optimizes all three strategies for shifts of ±1 and ±N days (same trip length) and returns `dateAlternatives`. The UI can re-run any of them as a new draft.
- **Multi-city:** 2–4 stops. Inter-city legs use `FlightProvider.searchLeg`. The demo model prefers regional carriers (ANA/JAL within Japan, BA/AF/TP within Europe). Experiences and credits are planned per stay through one shared credit ledger, so nothing is double counted across cities.
- **Household strategies** (`strategies/household.ts`): pooling advice, ownership and authorized-user transfer notes, top-up versus full transfer, valuations below a portal floor, active-bonus relevance, enrollment gaps and resets, and over-commitment across upcoming trips.
- **Trip re-optimization:** re-runs a saved trip with today's balances, rules and prices. `optimizer/diff.ts` shows the cash and points deltas and the changed bookings per strategy. Users can apply the changes, keep their edited itinerary, or keep the current plan.
- **Bonus monitoring and reminders:** active and upcoming transfer bonuses (Benefits → Transfers, home alerts), local notifications for credit resets, and an `.ics` export of reset dates.
- **Compatibility:** `optimizer/compat.ts` upgrades trips saved by earlier versions, through a persisted-store migration (v2).

## Itinerary

`src/lib/itinerary` builds the days from the selected plan. Flights and check-in/out are **anchored**, each marked as an opening or closing anchor for the day. Multi-city itineraries carry `stays[]`, and each day routes from that day's hotel. Arrivals that roll past midnight are handled, and activities start on the first usable day after arrival. Experiences are distributed across full days by time-of-day preference. Re-optimization orders flexible items by time slot, then nearest neighbour from the hotel, then recomputes start times and travel legs and flags overloaded days. Drag-and-drop (dnd-kit, with pointer, touch and keyboard sensors) and a "Move to day" control both call `moveItem()`.

## Data and persistence

- **Client:** `useApp` (Zustand) persists to IndexedDB through `idb-storage.ts`, falling back to localStorage and then memory. Unsaved drafts are capped at five.
- **Server (optional):** Prisma 7 with the `@prisma/adapter-pg` driver adapter. The schema models users, households, travelers, owned cards (primary or AU), balances, loyalty accounts (last 4 characters only), the full date-effective rules database, a rule-verification audit log, benefit usage and overrides, trips and a provider cache.
- **Rules loading:** `/api/rules` and the optimizer read from Postgres when it is configured and seeded, otherwise from the bundled seed. Results are cached for five minutes per instance.

## Authentication

Phase 1 is local-first and needs no account. For a two-person household on a self-hosted deployment, `/api/sync` stores a validated snapshot protected by `PERKPILOT_SYNC_TOKEN` (constant-time comparison, rate limited).

For multi-household deployments, replace the token with real authentication, for example Auth.js with email magic links or passkeys. Scope `Household.ownerId` to the session user, and move `/api/sync` to per-household rows (`Traveler`, `PointsBalance`, `BenefitUsage`, `Trip`). The Prisma schema already contains those tables.

## Security

See [SECURITY.md](../SECURITY.md) for the threat model and controls: server-only keys, trusted-proxy IP rate limiting, the daily LLM ceiling, same-origin enforcement, streaming body caps, Zod validation of every input (including imports and sync), `safeHref` for all external links, and CSP/HSTS headers.

## PWA and offline

`public/sw.js` precaches the app shell and pages, caches hashed build assets with cache-first, and serves navigations network-first with a fallback to the cached page (query strings ignored, so `/trip?id=…` works offline), then `/offline`. Map tiles get a bounded cache. API calls are never cached except `/api/rules`, which uses stale-while-revalidate. The header shows an offline badge and banner, and search and the concierge are disabled while offline.

## Testing

`npm test` runs Vitest suites for:

- the cents-per-point formula, including parity with the spec's dollar form
- transfers: increments, 1:2, 5:4, 250:200 and bonuses
- benefit periods (semiannual, quarterly, cardmember year)
- confidence scoring
- date-effective rules and overrides
- transitional portal rates
- credit eligibility and ledger de-duplication
- authorized-user handling
- pooling: Chase combinable, Amex not, unknown programs not
- optimizer invariants: three plans, Savings ≤ Luxury cash, minimum cents per point respected, no negative balances, no double-counted credits, consistent totals, demo labelling, explicit transfers
- itinerary building, moving and re-optimization
- Zod validation
- concierge intent parsing and tools
- the Duffel adapter, with a mocked API
- the demo flight model's determinism and labelling
