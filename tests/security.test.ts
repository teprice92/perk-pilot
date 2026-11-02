import { afterEach, describe, expect, it, vi } from "vitest";
import { DataImportSchema, HouseholdSchema, TripRequestSchema } from "@/lib/domain/schemas";
import { safeHref } from "@/lib/safe-url";
import { clientIp, consumeDailyBudget } from "@/lib/server/rate-limit";
import { assertSameOrigin, HttpError, readJson } from "@/lib/server/request";
import { demoHousehold } from "@/lib/demo/household";

vi.mock("server-only", () => ({}));

const req = (headers: Record<string, string>, body?: string) => new Request("http://app.test/api/x", { method: "POST", headers, body });

afterEach(() => vi.unstubAllEnvs());

describe("client IP for rate limiting", () => {
  it("ignores client-supplied X-Forwarded-For entries in front of the trusted proxy", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("supports multiple proxy hops and direct exposure", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6" }))).toBe("direct");
  });
});

describe("daily budget", () => {
  it("stops at the limit", () => {
    const scope = `t-${Math.random()}`;
    expect([1, 2, 3, 4].map(() => consumeDailyBudget(scope, 3))).toEqual([true, true, true, false]);
    expect(consumeDailyBudget(`z-${Math.random()}`, 0)).toBe(false);
  });
});

describe("request hardening", () => {
  it("caps bodies even without Content-Length", async () => {
    const big = "x".repeat(2000);
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ big }))); c.close(); } });
    const r = new Request("http://app.test/api/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readJson(r, 1000)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(req({ "content-type": "application/json" }, '{"a":1}'), 1000)).resolves.toEqual({ a: 1 });
    await expect(readJson(req({}, "{nope"), 1000)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects cross-site browser requests", () => {
    expect(() => assertSameOrigin(req({ origin: "https://evil.example", host: "app.test" }))).toThrow(HttpError);
    expect(() => assertSameOrigin(req({ "sec-fetch-site": "cross-site", host: "app.test" }))).toThrow(HttpError);
    expect(() => assertSameOrigin(req({ origin: "http://app.test", host: "app.test", "sec-fetch-site": "same-origin" }))).not.toThrow();
    expect(() => assertSameOrigin(req({ host: "app.test" }))).not.toThrow(); // non-browser client
    vi.stubEnv("ALLOWED_ORIGINS", "https://staging.example");
    expect(() => assertSameOrigin(req({ origin: "https://staging.example", host: "app.test" }))).not.toThrow();
  });
});

describe("input limits", () => {
  it("bounds party size and the valuations map", () => {
    expect(TripRequestSchema.safeParse({ destinationId: "tokyo", origin: "SFO", departDate: "2027-04-01", returnDate: "2027-04-05", adults: 8, children: 6 }).success).toBe(false);
    const h = demoHousehold();
    h.valuations = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`p${i}`, 1]));
    expect(HouseholdSchema.safeParse(h).success).toBe(false);
  });
  it("rejects malformed backup files", () => {
    expect(DataImportSchema.safeParse({ household: { travelers: [] } }).success).toBe(false);
    expect(DataImportSchema.safeParse({ household: demoHousehold(), trips: [{ id: "x" }] }).success).toBe(false);
    expect(DataImportSchema.safeParse({ household: demoHousehold() }).success).toBe(true);
  });
});

describe("safeHref", () => {
  it("only allows http(s) links", () => {
    expect(safeHref("https://www.united.com/x")).toBe("https://www.united.com/x");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHref("//evil.example")).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
