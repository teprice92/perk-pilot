import { afterEach, describe, expect, it, vi } from "vitest";
import { duffelFlightProvider, isoDurationMinutes, mapDuffelOffer } from "@/lib/providers/live/duffel";
import { generateFlights } from "@/lib/providers/demo/flights";

const offer = {
  id: "off_123",
  total_amount: "1843.20",
  total_currency: "USD",
  owner: { iata_code: "NH", name: "ANA" },
  conditions: { refund_before_departure: { allowed: true } },
  slices: [
    {
      duration: "PT11H5M",
      segments: [
        { departing_at: "2027-04-02T11:15:00", arriving_at: "2027-04-03T14:20:00", origin: { iata_code: "SFO" }, destination: { iata_code: "HND" }, marketing_carrier: { iata_code: "NH", name: "ANA" }, marketing_carrier_flight_number: "7", passengers: [{ cabin_class: "economy" }] },
      ],
    },
  ],
};

describe("Duffel adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("parses ISO durations", () => {
    expect(isoDurationMinutes("PT11H5M")).toBe(665);
    expect(isoDurationMinutes("P1DT2H")).toBe(1560);
  });
  it("maps offers to live FlightOffers without inventing awards", () => {
    const f = mapDuffelOffer(offer, "outbound", 2, "economy", "2026-11-01T00:00:00Z")!;
    expect(f).toMatchObject({ dataKind: "live", carrier: "NH", cashPerPersonCents: 92_160, stops: 0, arrivesNextDay: true, refundable: true, durationMin: 665 });
    expect(f.awards).toEqual([]);
  });
  it("skips non-USD offers rather than guessing exchange rates", () => {
    expect(mapDuffelOffer({ ...offer, total_currency: "EUR" }, "outbound", 2, "economy", "")).toBeNull();
  });
  it("calls the API server-side with the token and degrades gracefully on errors", async () => {
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", "duffel_test_x");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.data.slices[0].origin === "HND") return new Response("boom", { status: 500 });
      return Response.json({ data: { offers: [offer] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await duffelFlightProvider.searchFlights({ origin: "SFO", destinationAirports: ["HND"], departDate: "2027-04-02", returnDate: "2027-04-09", adults: 2, children: 0, cabins: ["economy"], flexibleDays: 0 });
    expect(r.outbound).toHaveLength(1);
    expect(r.return).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes("failed"))).toBe(true);
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer duffel_test_x");
    expect(headers["Duffel-Version"]).toBe("v2");
  });
});

describe("demo flight model", () => {
  const params = { origin: "SFO", destinationAirports: ["HND", "NRT"], departDate: "2027-04-02", returnDate: "2027-04-09", adults: 2, children: 0, cabins: ["economy", "business"] as const, flexibleDays: 1, destinationId: "tokyo", bestMonths: [4] };
  it("is deterministic for the same search", () => {
    const a = generateFlights({ ...params, cabins: [...params.cabins] });
    const b = generateFlights({ ...params, cabins: [...params.cabins] });
    expect(a.outbound.map((o) => o.cashPerPersonCents)).toEqual(b.outbound.map((o) => o.cashPerPersonCents));
  });
  it("labels everything as demo and never confirmed", () => {
    const r = generateFlights({ ...params, cabins: [...params.cabins] });
    expect(r.dataKind).toBe("demo");
    for (const o of [...r.outbound, ...r.return]) {
      expect(o.dataKind).toBe("demo");
      for (const a of o.awards) expect(a.availability).toBe("estimated");
    }
  });
  it("covers nearby airports and flexible dates", () => {
    const r = generateFlights({ ...params, cabins: [...params.cabins] });
    expect(new Set(r.outbound.map((o) => o.destination))).toEqual(new Set(["HND", "NRT"]));
    expect(r.dateInsights.length).toBe(4);
  });
});
