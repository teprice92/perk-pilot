import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlightOffer } from "@/lib/domain/types";
import { attachAwards } from "@/lib/providers/awards";
import { mapPlace } from "@/lib/providers/live/google-places";
import { mapSeatsAeroRow, seatsAeroProvider } from "@/lib/providers/live/seats-aero";
import { mapUnsplash } from "@/lib/providers/live/unsplash";
import { withAwards, demoFlightProvider } from "@/lib/providers/registry";
import { PROGRAMS } from "@/lib/rules/seed";

const baseOffer = (over: Partial<FlightOffer> = {}): FlightOffer => ({
  id: "f1", provider: "Demo", dataKind: "demo", fetchedAt: "", direction: "outbound", origin: "SFO", destination: "HND", date: "2027-04-02",
  departTime: "11:00", arriveTime: "15:00", arrivesNextDay: true, durationMin: 660, stops: 0, carrier: "NH", carrierName: "ANA", flightNumbers: ["NH7"],
  cabin: "business", cashPerPersonCents: 500_000, refundable: false, bookingUrl: "",
  awards: [{ programId: "united", pointsPerPerson: 99_000, taxesPerPersonCents: 5_600, awardOnlyChargesPerPersonCents: 0, availability: "estimated" }, { programId: "aeroplan", pointsPerPerson: 75_000, taxesPerPersonCents: 5_600, awardOnlyChargesPerPersonCents: 0, availability: "estimated" }],
  ...over,
});

const seatsRow = { ID: "x", Date: "2027-04-02", Source: "united", Route: { OriginAirport: "SFO", DestinationAirport: "HND" }, UpdatedAt: "2026-11-01T10:00:00Z", JAvailable: true, JMileageCost: "88000", JTotalTaxes: 5_610, TaxesCurrency: "USD", JRemainingSeats: 2, JDirect: true, JAirlines: "NH, UA", YAvailable: false };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Seats.aero adapter & award merging", () => {
  it("maps cached rows per cabin and ignores unknown sources", () => {
    const rows = mapSeatsAeroRow(seatsRow, ["economy", "business"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ programId: "united", cabin: "business", pointsPerPerson: 88_000, taxesPerPersonCents: 5_610, seats: 2, carriers: ["NH", "UA"], status: "cached" });
    expect(mapSeatsAeroRow({ ...seatsRow, Source: "unknownprog" }, ["business"])).toEqual([]);
  });
  it("replaces the modelled estimate for that program and keeps others labelled estimated", () => {
    const [o] = attachAwards([baseOffer()], mapSeatsAeroRow(seatsRow, ["business"]), PROGRAMS);
    const united = o!.awards.find((a) => a.programId === "united")!;
    expect(united).toMatchObject({ availability: "cached", pointsPerPerson: 88_000, source: "Seats.aero", taxesEstimated: false });
    expect(o!.awards.find((a) => a.programId === "aeroplan")!.availability).toBe("estimated");
  });
  it("does not attach to carriers the program can't book, other cabins, or connecting flights for direct-only space", () => {
    const rows = mapSeatsAeroRow(seatsRow, ["business"]);
    expect(attachAwards([baseOffer({ carrier: "DL" })], rows, PROGRAMS)[0]!.awards.every((a) => a.availability === "estimated")).toBe(true);
    expect(attachAwards([baseOffer({ cabin: "economy" })], rows, PROGRAMS)[0]!.awards.every((a) => a.availability === "estimated")).toBe(true);
    expect(attachAwards([baseOffer({ stops: 1 })], rows, PROGRAMS)[0]!.awards.every((a) => a.availability === "estimated")).toBe(true);
  });
  it("calls the Partner API with the key header", async () => {
    vi.stubEnv("SEATS_AERO_API_KEY", "pk_test");
    const fetchMock = vi.fn(async () => Response.json({ data: [seatsRow] }));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await seatsAeroProvider.searchAwards({ origin: "SFO", destination: "HND", date: "2027-04-02", cabins: ["business"] });
    expect(rows).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain("origin_airport=SFO");
    expect((init.headers as Record<string, string>)["Partner-Authorization"]).toBe("pk_test");
  });
  it("withAwards enriches a cash provider and degrades gracefully when the award source fails", async () => {
    const failing = { info: () => ({ id: "x", name: "Broken awards", category: "flights_award" as const, configured: true, dataKind: "cached" as const, notes: "", envVars: [] }), searchAwards: async () => { throw new Error("down"); } };
    const res = await withAwards(demoFlightProvider, failing).searchFlights({ origin: "SFO", destinationAirports: ["HND"], departDate: "2027-04-02", returnDate: "2027-04-09", adults: 2, children: 0, cabins: ["business"], flexibleDays: 0, destinationId: "tokyo" });
    expect(res.outbound.length).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.includes("Broken awards"))).toBe(true);
  });
});

describe("Google Places & Unsplash", () => {
  it("maps places with estimated prices and attribution, never merchant tags", () => {
    const e = mapPlace({ id: "p1", displayName: { text: "Sushi Place" }, location: { latitude: 35.6, longitude: 139.7 }, rating: 4.7, priceLevel: "PRICE_LEVEL_EXPENSIVE", formattedAddress: "1-2-3 Ginza, Chuo City, Tokyo, Japan" }, { q: "x", category: "dining", styles: ["food"], bestTime: "evening", duration: 120 }, "tokyo")!;
    expect(e).toMatchObject({ pricePerPersonCents: 9_500, priceEstimated: true, tags: [], attribution: "Google Maps", destinationId: "tokyo", dataKind: "live" });
  });
  it("adds UTM-tagged attribution links for Unsplash", () => {
    const img = mapUnsplash({ urls: { regular: "r", small: "s" }, alt_description: null, user: { name: "Ana", links: { html: "https://unsplash.com/@ana" } }, links: { html: "https://unsplash.com/photos/x" } }, "Tokyo");
    expect(img.photographerUrl).toContain("utm_source=perkpilot");
    expect(img.alt).toBe("Tokyo");
  });
});
