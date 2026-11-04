import { afterEach, describe, expect, it, vi } from "vitest";
import { cashToCents, mapRoomsResult, roomsAeroProvider, type RoomsSearchResult } from "@/lib/providers/live/rooms-aero";
import { demoHotelProvider, withHotelAwards } from "@/lib/providers/registry";
import { hotelOptions } from "@/lib/optimizer/options";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { demoHousehold } from "@/lib/demo/household";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const hyatt: RoomsSearchResult = {
  hotel: { id: "h1", source: "hyatt", name: "Park Hyatt Tokyo", brand: "Park Hyatt", award_category: "8", city: "Tokyo", latitude: 35.6856, longitude: 139.6908, url: "https://www.hyatt.com/park-hyatt/tyoph", open: true },
  lowest_award_standard: 35000,
  lowest_cash_standard: 1050,
  currency_code: "USD",
  cpp: 3.0,
  standard_date: "2027-04-02",
  standard_nights: 1,
  last_checked_at: "2026-11-04T10:00:00Z",
};

describe("cash units", () => {
  it("uses the API's cents-per-point to tell dollars from cents", () => {
    expect(cashToCents(1050, 35000, 3.0, "USD")).toBe(105_000); // dollars
    expect(cashToCents(105000, 35000, 3.0, "USD")).toBe(105_000); // cents
  });
  it("refuses to guess", () => {
    expect(cashToCents(1050, 35000, 3.0, "JPY")).toBeNull();
    expect(cashToCents(1050, 35000, 9.9, "USD")).toBeNull(); // doesn't reconcile either way
    expect(cashToCents(0, 35000, 3, "USD")).toBeNull();
  });
});

describe("mapping", () => {
  it("maps a real award hotel as cached data with honest caveats", () => {
    const h = mapRoomsResult(hyatt, "tokyo", true, 5, 4, 0)!;
    expect(h).toMatchObject({ provider: "Rooms.aero", dataKind: "cached", chainProgramId: "hyatt", nightlyCashCents: 105_000, tier: "luxury", tierEstimated: true, ratingUnknown: true, programs: [] });
    expect(h.award).toEqual({ programId: "hyatt", pointsPerNight: 35000, availability: "cached" });
    expect(h.sourceNotes!.join(" ")).toMatch(/first night/);
  });
  it("flags stays that weren't confirmed for every night", () => {
    expect(mapRoomsResult(hyatt, "tokyo", false, 5, 4, 0)!.sourceNotes!.join(" ")).toMatch(/arrival night only/);
    expect(mapRoomsResult(hyatt, "tokyo", true, 5, 7, 0)!.sourceNotes!.join(" ")).toMatch(/5 consecutive nights/);
  });
  it("skips closed hotels, unsupported programs and non-USD cash", () => {
    expect(mapRoomsResult({ ...hyatt, hotel: { ...hyatt.hotel!, open: false } }, "tokyo", true, 5, 4, 0)).toBeNull();
    expect(mapRoomsResult({ ...hyatt, hotel: { ...hyatt.hotel!, source: "wyndham" } }, "tokyo", true, 5, 4, 0)).toBeNull();
    expect(mapRoomsResult({ ...hyatt, currency_code: "EUR" }, "tokyo", true, 5, 4, 0)).toBeNull();
  });
  it("only links out over https", () => {
    expect(mapRoomsResult({ ...hyatt, hotel: { ...hyatt.hotel!, url: "javascript:alert(1)" } }, "tokyo", true, 5, 4, 0)!.bookingUrl).toMatch(/^https:\/\/www\.google\.com/);
  });
});

describe("provider", () => {
  it("searches the first night for pricing and the full stay for availability", async () => {
    vi.stubEnv("SEATS_AERO_API_KEY", "pro_test");
    const other: RoomsSearchResult = { ...hyatt, hotel: { ...hyatt.hotel!, id: "h2", name: "Andaz Tokyo" }, cpp: 3.5, lowest_cash_standard: 1225 };
    const fetchMock = vi.fn(async (url: URL) => {
      const nights = url.searchParams.get("nights");
      return Response.json({ data: nights === "1" ? [hyatt, other] : [hyatt], count: 1, has_more: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const hotels = await roomsAeroProvider.searchHotels({ destinationId: "tokyo", checkIn: "2027-05-02", checkOut: "2027-05-06", guests: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/partnerapi/search");
    expect(url.searchParams.get("start_date")).toBe("2027-05-02");
    expect(url.searchParams.get("location")).toBe("Tokyo, Japan");
    expect(url.searchParams.get("source")).toContain("hyatt");
    expect((init.headers as Record<string, string>)["Partner-Authorization"]).toBe("pro_test");
    // Park Hyatt (confirmed for the full stay) ranks ahead of Andaz despite lower cpp.
    expect(hotels.map((h) => h.name)).toEqual(["Park Hyatt Tokyo", "Andaz Tokyo"]);
    expect(hotels[1]!.sourceNotes!.join(" ")).toMatch(/arrival night only/);
  });
  it("falls back to the base catalogue if Rooms.aero fails", async () => {
    const broken = { info: () => ({ id: "x", name: "Broken", category: "hotel_awards" as const, configured: true, dataKind: "cached" as const, notes: "", envVars: [] }), searchHotels: async () => { throw new Error("down"); } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hotels = await withHotelAwards(demoHotelProvider, broken).searchHotels({ destinationId: "tokyo", checkIn: "2027-05-02", checkOut: "2027-05-06", guests: 2 });
    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels.every((h) => h.dataKind === "demo")).toBe(true);
  });
});

describe("optimizer with a real award hotel", () => {
  it("offers Chase UR → Hyatt with a real cents-per-point and a cached-availability caveat", () => {
    const rules = new RulesRepository(SEED_RULES, "2026-11-04");
    const h = mapRoomsResult(hyatt, "tokyo", true, 4, 4, 0)!;
    const opts = hotelOptions(h, { rules, household: demoHousehold(), party: 2, rooms: 1, nights: 4, bookingDate: "2026-11-04" });
    const xfer = opts.find((o) => o.method === "transfer_award" && o.bankProgramId === "chase-ur")!;
    expect(xfer).toBeTruthy();
    expect(xfer.partnerPoints).toBe(140_000);
    expect(xfer.cpp!).toBeGreaterThan(2.5);
    expect(xfer.warnings.join(" ")).toMatch(/Rooms\.aero saw award space/);
    expect(opts.some((o) => o.method === "program_booking")).toBe(false); // FHR/Edit eligibility is never guessed
  });
});
