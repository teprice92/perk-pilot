# Integrating live data providers

PerkPilot never fabricates live prices or availability. Until a provider is configured and validated, results come from the labelled demo model. This guide explains how to add real providers safely.

## Adapter contracts

`src/lib/providers/types.ts` defines:

```ts
interface FlightProvider     { info(): ProviderInfo; searchFlights(p: FlightSearchParams): Promise<FlightSearchResult> }
interface HotelProvider      { info(): ProviderInfo; searchHotels(p: HotelSearchParams): Promise<HotelOffer[]> }
interface ExperienceProvider { info(): ProviderInfo; searchExperiences(p: ExperienceSearchParams): Promise<ExperienceOffer[]> }
```

Every offer must set:

- `dataKind`: `"live"` for a real-time quote, `"cached"` for a snapshot (with an honest `fetchedAt`), `"demo"` for anything modelled.
- `fetchedAt`: an ISO timestamp. Confidence drops as data ages.
- `AwardOption.availability`: `"confirmed"` **only** when the source is real-time inventory for the exact flight, cabin and party size. Cached snapshots are `"cached"` (with `seenAt` and `source`); modelled prices are `"estimated"`.

Register the provider in `src/lib/providers/registry.ts`. Selection is opt-in: a provider is used only when its environment variables are present **and** an explicit enable flag is set. Never mix demo estimates into live results. The Duffel adapter deliberately returns `awards: []` rather than borrowing demo award prices.

## Integration checklist (do this before enabling any provider)

1. **Licensing and terms.** Confirm that commercial use, display, caching duration and attribution rules permit this use. Some APIs forbid caching or showing prices without booking intent.
2. **Access and pricing.** Check sandbox and production approval, per-call costs, and quotas. Set `RATE_LIMIT_PER_MINUTE` and add provider-side caching (`src/lib/server/cache.ts` or the `ProviderCache` table).
3. **Coverage.** Check which carriers, hotel chains or regions are covered. Note gaps in `ProviderInfo.notes` so the UI can show them.
4. **Freshness.** Know when offers expire. Re-price before showing booking instructions, and surface `fetchedAt`.
5. **Currency.** Only accept currencies you convert with a real rate source. The Duffel adapter skips non-USD offers instead of guessing.
6. **Errors.** Degrade per search: add a warning and keep the other results. Never fall back silently to demo data without labelling it.
7. **Secrets.** Keep keys in server environment variables only, never `NEXT_PUBLIC_*`. Access them only in route handlers or server modules.
8. **Tests.** Add fixture-based tests with a mocked `fetch`, as `tests/providers.test.ts` does for Duffel.

## Candidates

| Need | Candidate | Notes |
|---|---|---|
| Cash airfare | **Duffel** ✅ `live/duffel.ts` | `DUFFEL_ACCESS_TOKEN` + `PERKPILOT_LIVE_FLIGHTS=duffel`. One-way searches per direction, cabin and airport (so mixed cash/points itineraries work), plus multi-city legs. Offers expire quickly; cached 10 min. |
| Cash airfare | Amadeus Flight Offers Search — **retired** | Amadeus shut down its Self-Service developer program on 17 July 2026 (enterprise APIs only). The adapter was removed; Duffel is the supported cash-fare source. |
| Award availability | **Seats.aero Partner API** ✅ `live/seats-aero.ts` | `SEATS_AERO_API_KEY` + `PERKPILOT_LIVE_AWARDS=seats-aero`. Cached route/date/cabin snapshots → `availability: "cached"` with `seenAt`, seats left and source. `attachAwards()` applies a row only to flights whose carrier the program can book (and that the row lists, if it lists carriers), in the same cabin, nonstop if the row is direct-only. Cached data replaces the modelled estimate for that program only. Taxes are used only when the row reports them in USD; otherwise they are flagged `taxesEstimated`. Commercial use needs a partner agreement; validate field names against the current docs. |
| Hotel pricing | No live provider wired in | Amadeus Hotel Search was removed with the Self-Service shutdown. Candidates needing partner agreements: Expedia Rapid, Hotelbeds, Booking.com Demand API. Live hotels would get cash and portal options only; FHR/THC/Edit eligibility is never guessed. |
| Hotel award pricing | No general public API | Award rates stay modelled or user-verified; link to each program's award search. |
| Experiences | **Google Places API (New)** ✅ `live/google-places.ts` | `GOOGLE_PLACES_API_KEY` + `PERKPILOT_LIVE_EXPERIENCES=google-places`. Text Search by style. No ticket prices, so costs are estimated from `priceLevel` and labelled. No merchant tags, so no card credit is ever assumed. Show "Google Maps" attribution; don't cache content beyond what the terms allow (results are cached in memory for 6 hours per instance; trips saved on the user's device keep a snapshot, so review this against your agreement). Alternatives for bookable inventory: Viator Partner API, GetYourGuide. |
| Photography | **Unsplash** ✅ `live/unsplash.ts`, `/api/images` | `UNSPLASH_ACCESS_KEY`. Hotlinked with photographer and Unsplash credit (UTM-tagged links) on the trip hero. |
| Maps | OpenStreetMap tiles (default), MapTiler, Mapbox | Set `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_ATTRIBUTION`. Respect the tile usage policy; the public OSM servers are not for heavy production traffic. |

### Composition

`registry.ts` picks the cash flight source (Duffel when enabled, otherwise demo) and wraps it with `withAwards()` when Seats.aero is enabled. Hotels use the demo catalogue; experiences use Google Places when enabled, otherwise demo. Every provider failure becomes a per-search warning shown in the UI, never a silent fallback to unlabeled data. Flexible-date re-optimization only runs on demo or cached flight data, to avoid multiplying live API calls.

## Verified benefits data

Card rules live in Postgres (`npm run db:seed` loads the starter set). An administrator verifies each rule against its official source:

```bash
# What needs checking (unverified, or verified more than 90 days ago)
curl -H "Authorization: Bearer $PERKPILOT_ADMIN_TOKEN" https://your-app/api/admin/verify

# Record a verification (optionally correcting a credit amount)
curl -X POST -H "Authorization: Bearer $PERKPILOT_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"ruleType":"benefit","ruleId":"csr-travel-credit","status":"verified","sourceUrl":"https://creditcards.chase.com/...","verifiedBy":"ops@example.com"}' \
  https://your-app/api/admin/verify
```

Each call updates the rule's `verification` and `lastVerified`, writes a `RuleVerification` audit row (amount corrections record the previous value), and clears the rules cache. The UI marks verifications older than 90 days as "re-check". Households can still override amounts locally on the Benefits page.

## Issuer portals and card offers

PerkPilot does **not** assume that Amex Travel, Chase Travel, Amex Offers or Chase Offers have public booking or offer APIs. Portal redemptions are modelled from date-effective `PortalRate` rows. Chase "Points Boost" is never assumed. The UI links to the official portals so users can verify the price.

Card offers and benefits are maintained in the rules database through an admin or user verification workflow: the `RuleVerification` audit table, plus per-household overrides in the Benefits page.

## Account connections (future)

To read balances automatically, use only read-only, OAuth-based aggregation that the issuer or loyalty program officially supports. PerkPilot must never store passwords or card numbers. Store only tokens issued for read access, encrypted at rest, revocable by the user, and scoped to balances.
