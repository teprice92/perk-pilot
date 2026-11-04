import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cookie, readCookie, safeEqual, sha256, sign, unsign } from "@/lib/server/auth/tokens";
import { mergeSnapshot } from "@/lib/store/sync-merge";
import { proxy } from "@/proxy";
import { demoHousehold } from "@/lib/demo/household";
import type { SavedTrip } from "@/lib/store/app-store";

vi.mock("server-only", () => ({}));

const SECRET = "x".repeat(40);
afterEach(() => vi.unstubAllEnvs());

describe("signed cookies", () => {
  it("round-trips and rejects tampering", () => {
    const s = sign("token123", SECRET);
    expect(unsign(s, SECRET)).toBe("token123");
    expect(unsign(s.replace("token123", "token124"), SECRET)).toBeNull();
    expect(unsign(`${s}x`, SECRET)).toBeNull();
    expect(unsign(s, "y".repeat(40))).toBeNull();
    expect(unsign("abc.def", SECRET)).toBeNull();
    expect(unsign(undefined, SECRET)).toBeNull();
  });
  it("refuses to sign without a strong AUTH_SECRET", () => {
    vi.stubEnv("AUTH_SECRET", "short");
    expect(() => sign("v")).toThrow(/AUTH_SECRET/);
  });
  it("builds hardened cookies and parses them", () => {
    const c = cookie("pp_session", "a.b", { maxAge: 60, secure: true });
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
    expect(readCookie("foo=1; pp_session=a.b; bar=2", "pp_session")).toBe("a.b");
    expect(readCookie("foo=1", "pp_session")).toBeUndefined();
  });
  it("hashes tokens and compares secrets safely", () => {
    expect(sha256("a")).toHaveLength(64);
    expect(safeEqual("owner-setup-code-1", "owner-setup-code-1")).toBe(true);
    expect(safeEqual("owner-setup-code-1", "owner-setup-code-2")).toBe(false);
    expect(safeEqual("short", "longer-value")).toBe(false);
  });
});

describe("proxy page gate", () => {
  const req = (path: string, cookieValue?: string) => {
    const r = new NextRequest(`http://app.test${path}`);
    if (cookieValue) r.cookies.set("pp_session", cookieValue);
    return r;
  };
  it("does nothing when logins are off", () => {
    expect(proxy(req("/wallet")).headers.get("location")).toBeNull();
  });
  it("redirects signed-out visitors to /login with a safe next path", () => {
    vi.stubEnv("PERKPILOT_AUTH", "passkey");
    vi.stubEnv("AUTH_SECRET", SECRET);
    const loc = proxy(req("/trip?id=1")).headers.get("location")!;
    expect(new URL(loc).pathname).toBe("/login");
    expect(new URL(loc).searchParams.get("next")).toBe("/trip?id=1");
    expect(proxy(req("/wallet", "forged.value")).headers.get("location")).toContain("/login");
    expect(proxy(req("/wallet", sign("tok", SECRET))).headers.get("location")).toBeNull();
    expect(proxy(req("/login")).headers.get("location")).toBeNull();
    expect(proxy(req("/signup?invite=x")).headers.get("location")).toBeNull();
  });
  it("fails closed without AUTH_SECRET", () => {
    vi.stubEnv("PERKPILOT_AUTH", "passkey");
    vi.stubEnv("AUTH_SECRET", "");
    expect(proxy(req("/wallet", "a.b")).headers.get("location")).toContain("/login");
  });
});

describe("household sync merge", () => {
  const trip = (id: string, updatedAt: string, saved = true) => ({ id, updatedAt, saved }) as unknown as SavedTrip;
  const household = demoHousehold();
  it("takes the server household and the newest copy of each trip", () => {
    const m = mergeSnapshot({ trips: [trip("a", "2026-11-02"), trip("b", "2026-11-01")] }, { household, trips: [trip("a", "2026-11-01"), trip("b", "2026-11-03")] });
    expect(m.household).toBe(household);
    expect(m.trips.find((t) => t.id === "a")!.updatedAt).toBe("2026-11-02");
    expect(m.trips.find((t) => t.id === "b")!.updatedAt).toBe("2026-11-03");
  });
  it("keeps local drafts, drops trips deleted elsewhere, but uploads on first sync", () => {
    const local = { trips: [trip("draft", "2026-11-01", false), trip("gone", "2026-11-01")] };
    const ids = (x: { trips: SavedTrip[] }) => x.trips.map((t) => t.id).sort();
    expect(ids(mergeSnapshot(local, { household, trips: [] }))).toEqual(["draft"]);
    expect(ids(mergeSnapshot(local, { household, trips: [] }, { firstSync: true }))).toEqual(["draft", "gone"]);
  });
});

describe("setup diagnostics", () => {
  it("turns missing tables and unreachable databases into actionable 503s", async () => {
    const { errorResponse } = await import("@/lib/server/request");
    const missing = errorResponse(Object.assign(new Error("The table `public.AuthChallenge` does not exist in the current database."), { code: "P2021" }));
    expect(missing.status).toBe(503);
    expect((await missing.json()).error).toMatch(/prisma db push/);
    const down = errorResponse(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(down.status).toBe(503);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(errorResponse(new Error("boom")).status).toBe(500);
  });

  it("rejects a malformed PERKPILOT_ORIGIN or mismatched RP ID with a clear message", async () => {
    const { relyingParty } = await import("@/lib/server/auth/config");
    const req = new Request("https://app.example.com/api/auth/register/options");
    vi.stubEnv("PERKPILOT_ORIGIN", "app.example.com");
    expect(() => relyingParty(req)).toThrow(/include https:\/\//);
    vi.stubEnv("PERKPILOT_ORIGIN", "https://app.example.com/");
    expect(relyingParty(req)).toMatchObject({ rpID: "app.example.com", origin: "https://app.example.com" });
    vi.stubEnv("PERKPILOT_RP_ID", "other.com");
    expect(() => relyingParty(req)).toThrow(/PERKPILOT_RP_ID/);
    vi.stubEnv("PERKPILOT_RP_ID", "example.com");
    expect(relyingParty(req).rpID).toBe("example.com");
  });
});
