import { afterEach, describe, expect, it, vi } from "vitest";
import { destinationById, parsePlaceId, placeId } from "@/lib/providers/demo/catalog";
import { airportInfo, nearestAirports, searchAirportCities } from "@/lib/geo/airports";
import { searchPlaces } from "@/lib/geo/place-search";
import { optimizeTrip } from "@/lib/optimizer/engine";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { demoHousehold, demoUsage } from "@/lib/demo/household";
import { TripRequestSchema } from "@/lib/domain/schemas";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("place ids", () => {
  it("round-trips a searched place and rejects tampered ids", () => {
    const id = placeId({ name: "Porto", region: "Porto District", countryCode: "pt", lat: 41.1496, lng: -8.611, airports: ["OPO"] });
    expect(id).toBe("place:41.150:-8.611:OPO:PT:Porto:Porto District");
    const d = destinationById(id)!;
    expect(d).toMatchObject({ name: "Porto", country: "Portugal", airports: ["OPO"], region: "Porto District" });
    expect(destinationById(placeId({ name: "Porto", countryCode: "PT", lat: 41.15, lng: -8.61, airports: ["OPO"] }))!.region).toBe("");
    expect(parsePlaceId("place:41.1:-8.6:opo:PT:Porto")).toBeUndefined();
    expect(parsePlaceId("place:91:0:OPO:PT:Porto")).toBeUndefined();
    expect(parsePlaceId("place:41.1:-8.6:OPO:PT:<script>")).toBeUndefined();
    expect(parsePlaceId("place:41.1:-8.6:OPO.LIS.FAO:PT:Porto")).toBeUndefined();
    expect(placeId({ name: "Bad:<b>name", countryCode: "US", lat: 1, lng: 2, airports: ["LAX"] })).not.toMatch(/<|Bad:/);
  });

  it("accepts long place ids in trip requests", () => {
    const id = placeId({ name: "San Miguel de Allende", region: "Guanajuato", countryCode: "MX", lat: 20.9144, lng: -100.7452, airports: ["BJX", "QRO"] });
    const r = TripRequestSchema.safeParse({ destinationId: id, origin: "SFO", departDate: "2027-03-01", returnDate: "2027-03-05" });
    expect(r.success).toBe(true);
  });
});

describe("world airports", () => {
  it("knows airports outside the curated list", () => {
    expect(airportInfo("OPO")).toMatchObject({ country: "PT", large: true });
    expect(airportInfo("SFO")?.tz).toBe(-8);
  });

  it("picks sensible airports for a place", () => {
    expect(nearestAirports(41.1496, -8.611).map((a) => a.code)).toContain("OPO");
    // Positano: Naples is the airport people use.
    expect(nearestAirports(40.6281, 14.485).map((a) => a.code)).toContain("NAP");
    // The middle of the Pacific has nothing within reach.
    expect(nearestAirports(-30, -140)).toEqual([]);
  });

  it("offline city search finds cities with airports", () => {
    expect(searchAirportCities("porto")[0]).toMatchObject({ name: "Porto", country: "PT" });
  });
});

describe("searchPlaces", () => {
  it("lists catalogue matches first, then geocoded places with airports", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [
      { name: "Porto", latitude: 41.14961, longitude: -8.61099, country_code: "PT", admin1: "Porto", feature_code: "PPLA" },
      { name: "Lisbon", latitude: 38.71667, longitude: -9.13333, country_code: "PT", feature_code: "PPLC" },
    ] })));
    const { results, source } = await searchPlaces("Porto test");
    expect(source).toBe("geocoder");
    expect(results.find((r) => r.name === "Porto")).toMatchObject({ kind: "place", airports: ["OPO"] });
    // Lisbon is already a catalogue destination, so the geocoded copy is dropped.
    expect(results.filter((r) => r.name === "Lisbon")).toHaveLength(0);
  });

  it("falls back to the offline airport-city list when the geocoder is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { results, source } = await searchPlaces("Porto offline");
    expect(source).toBe("offline");
    expect(results).toEqual([]);
    const r2 = await searchPlaces("porto");
    expect(r2.results.some((r) => r.name === "Porto" && r.kind === "place")).toBe(true);
  });
});

describe("optimizing a searched place", () => {
  it("plans flights, hotels and experiences for any city", async () => {
    const id = placeId({ name: "Porto", countryCode: "PT", lat: 41.1496, lng: -8.611, airports: ["OPO"] });
    const result = await optimizeTrip({
      request: { destinationId: id, origin: "SFO", departDate: "2027-05-10", returnDate: "2027-05-15", flexibleDays: 0, adults: 2, children: 0 },
      household: demoHousehold(),
      rules: new RulesRepository(SEED_RULES, "2026-11-01"),
      usage: demoUsage(),
    });
    expect(result.destination.name).toBe("Porto");
    expect(Object.keys(result.plans.balanced.components)).toEqual(expect.arrayContaining(["outbound", "return", "hotel"]));
    expect(result.experiences.length).toBeGreaterThan(5);
  });
});
