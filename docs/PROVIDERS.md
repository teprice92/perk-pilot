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
- `AwardOption.availability`: `"confirmed"` **only** when the source is real-time inventory for the exact flight, cabin and party size. Cached award searches are `"estimated"`.

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
| Cash airfare | **Duffel** ✅ implemented (`live/duffel.ts`) | Enable with `DUFFEL_ACCESS_TOKEN` + `PERKPILOT_LIVE_FLIGHTS=duffel`. Offers expire quickly; results are cached for 10 minutes. Test mode is available. |
| Cash airfare and hotels | Amadeus Self-Service | Free test tier with limited data; production requires approval. OAuth client credentials (`AMADEUS_CLIENT_ID/SECRET`). |
| Award availability | Seats.aero Partner API (scaffold in `live/seats-aero.ts`) | Cached snapshots, so map to `availability: "estimated"` with the snapshot age. Commercial use needs a partner agreement. Never present results as confirmed. |
| Hotel pricing | Expedia Rapid, Hotelbeds, Booking.com Demand API | All require partner agreements and have display rules. Map loyalty program and brand to `chainProgramId`. |
| Hotel award pricing | No general public API | Keep award rates as user-verified or estimated; link to each program's award search. |
| Experiences | Viator Partner API, GetYourGuide, Google Places | Places content has caching and attribution limits. Set `tags` (for example `stubhub`, `resy`, `sapphire_tables`) only when the platform is verified, because benefits match on tags. |
| Maps | OpenStreetMap tiles (default), MapTiler, Mapbox | Set `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_ATTRIBUTION`. Respect the tile usage policy; the public OSM servers are not for heavy production traffic. |
| Photography | Unsplash API | Requires photographer attribution and hotlinking per the API guidelines. Without it, PerkPilot uses generative "postcard" art. |

## Issuer portals and card offers

PerkPilot does **not** assume that Amex Travel, Chase Travel, Amex Offers or Chase Offers have public booking or offer APIs. Portal redemptions are modelled from date-effective `PortalRate` rows. Chase "Points Boost" is never assumed. The UI links to the official portals so users can verify the price.

Card offers and benefits are maintained in the rules database through an admin or user verification workflow: the `RuleVerification` audit table, plus per-household overrides in the Benefits page.

## Account connections (future)

To read balances automatically, use only read-only, OAuth-based aggregation that the issuer or loyalty program officially supports. PerkPilot must never store passwords or card numbers. Store only tokens issued for read access, encrypted at rest, revocable by the user, and scoped to balances.
