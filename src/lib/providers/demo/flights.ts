import type { AwardOption, Cabin, FlightOffer } from "@/lib/domain/types";
import { PROGRAMS } from "@/lib/rules/seed";
import { AIRPORTS, CARRIERS, ROUTES } from "./destinations";
import { haversineKm, kmToMiles } from "./geo";
import { seeded } from "./random";
import { googleFlightsUrl } from "@/lib/links";
import type { DateInsight, FlightSearchParams, FlightSearchResult, LegSearchParams } from "../types";

/**
 * Demo flight model. Produces plausible — but NOT real — cash fares and award
 * pricing estimates. Award availability is always "estimated": PerkPilot never
 * claims seats exist without a live inventory source.
 */

const TZ: Record<string, number> = {
  SFO: -8, LAX: -8, SEA: -8, PDX: -8, SAN: -8, LAS: -8, PHX: -7, DEN: -7, SLC: -7,
  ORD: -6, DFW: -6, IAH: -6, AUS: -6, MSP: -6, JFK: -5, EWR: -5, LGA: -5, BOS: -5,
  ATL: -5, MIA: -5, IAD: -5, DCA: -5, PHL: -5, DTW: -5, CLT: -5, HNL: -10, OGG: -10,
  HND: 9, NRT: 9, KIX: 9, CDG: 1, ORY: 1, LHR: 0, LGW: 0, FCO: 1, LIS: 0, CUN: -5, DPS: 8, KEF: 0,
};

const BANDS = [700, 1500, 3000, 5000, 7000, Infinity];
const BASE_ECON = [7500, 12500, 20000, 30000, 40000, 47500];
const BASE_BIZ = [15000, 25000, 40000, 60000, 75000, 90000];
const SURCHARGE_BASE_USD = [0, 0, 40, 140, 230, 290];

type Profile = { econ: number; biz: number; revenueCpp?: number; passesSurcharges?: boolean; note?: string };
const PROFILES: Record<string, Profile> = {
  united: { econ: 1.15, biz: 1.35 },
  aeroplan: { econ: 1.0, biz: 1.0 },
  ana: { econ: 0.8, biz: 0.8, passesSurcharges: true, note: "ANA partner awards are typically round-trip only." },
  singapore: { econ: 1.05, biz: 1.1, passesSurcharges: true },
  avianca: { econ: 1.05, biz: 1.05 },
  flyingblue: { econ: 1.0, biz: 1.15, passesSurcharges: true },
  virgin: { econ: 0.95, biz: 0.85, passesSurcharges: true },
  delta: { econ: 1, biz: 1, revenueCpp: 1.15 },
  "avios-ba": { econ: 0.85, biz: 1.05, passesSurcharges: true },
  qatar: { econ: 1.0, biz: 0.95 },
  cathay: { econ: 1.0, biz: 1.0, passesSurcharges: true },
  qantas: { econ: 1.15, biz: 1.2, passesSurcharges: true },
  emirates: { econ: 1.5, biz: 1.6, passesSurcharges: true },
  jetblue: { econ: 1, biz: 1, revenueCpp: 1.35 },
  southwest: { econ: 1, biz: 1, revenueCpp: 1.4 },
};

const AIRLINE_PROGRAMS = PROGRAMS.filter((p) => p.kind === "airline" && PROFILES[p.id]);

function band(miles: number): number {
  return BANDS.findIndex((b) => miles < b);
}

function seasonFactor(dateISO: string, bestMonths: number[]): number {
  const [, m, d] = dateISO.split("-").map(Number) as [number, number, number];
  if ((m === 12 && d >= 15) || (m === 1 && d <= 5)) return 1.3;
  if (bestMonths.includes(m)) return 1.12;
  return 0.95;
}

function addMinutes(hhmm: string, minutes: number): { time: string; dayOffset: number } {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  const dayOffset = Math.floor(total / 1440);
  const mins = ((total % 1440) + 1440) % 1440;
  return { time: `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`, dayOffset };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function cabinsFor(carrier: string, miles: number): Cabin[] {
  const c: Cabin[] = ["economy"];
  const lowCost = ["WN", "B6", "HA", "AS", "FI"].includes(carrier);
  if (miles > 3000 && !lowCost) c.push("premium_economy");
  if (carrier !== "WN") c.push("business");
  if (CARRIERS[carrier]?.firstClass && miles > 5000) c.push("first");
  return c;
}

function awardTaxesUSD(origin: string, dest: string, cabin: Cabin, rnd: () => number): number {
  const oC = AIRPORTS[origin]?.country;
  const dC = AIRPORTS[dest]?.country;
  if (oC === "US" && dC === "US") return 5.6;
  let base = 35 + rnd() * 50;
  if (oC === "GB") base += cabin === "economy" ? 105 : 245; // UK departure duty on premium cabins
  if (oC === "FR" || oC === "IT") base += 40;
  return Math.round(base * 100) / 100;
}

function buildAwards(
  carrier: string,
  cabin: Cabin,
  miles: number,
  cashPerPersonCents: number,
  origin: string,
  dest: string,
  rnd: () => number,
): AwardOption[] {
  const b = band(miles);
  const taxes = awardTaxesUSD(origin, dest, cabin, rnd);
  const awards: AwardOption[] = [];
  for (const prog of AIRLINE_PROGRAMS) {
    if (!prog.bookableCarriers?.includes(carrier)) continue;
    const prof = PROFILES[prog.id]!;
    let points: number;
    if (prof.revenueCpp) {
      // Revenue-based programs: points track the cash fare.
      if (prog.id !== "delta" && prog.bookableCarriers.length > 1) continue;
      points = Math.round(((cashPerPersonCents - taxes * 100) / prof.revenueCpp) / 100) * 100;
    } else {
      const baseEcon = BASE_ECON[b]!;
      const baseBiz = BASE_BIZ[b]!;
      const raw =
        cabin === "economy" ? baseEcon * prof.econ
        : cabin === "premium_economy" ? baseEcon * 1.7 * prof.econ
        : cabin === "business" ? baseBiz * prof.biz
        : baseBiz * 1.55 * prof.biz;
      // Partner awards cost a bit more on dynamic programs; jitter ±8%.
      points = Math.round((raw * (0.94 + rnd() * 0.16)) / 500) * 500;
    }
    const surchargeLevel = CARRIERS[carrier]?.surchargeLevel ?? 0;
    const surcharge = prof.passesSurcharges
      ? Math.round(SURCHARGE_BASE_USD[b]! * surchargeLevel * (cabin === "economy" ? 1 : cabin === "premium_economy" ? 1.4 : 2) * 100)
      : 0;
    awards.push({
      programId: prog.id,
      pointsPerPerson: Math.max(points, 4500),
      taxesPerPersonCents: Math.round(taxes * 100),
      awardOnlyChargesPerPersonCents: surcharge,
      availability: "estimated",
      verifyUrl: prog.awardSearchUrl,
    });
  }
  return awards.sort((a, z) => a.pointsPerPerson - z.pointsPerPerson).slice(0, 4);
}

function priceCash(miles: number, cabin: Cabin, season: number, rnd: () => number, carrier: string, domestic: boolean): number {
  const econ = (70 + 0.1 * miles) * season * (0.85 + rnd() * 0.4) * (["WN", "B6", "FI", "AS"].includes(carrier) ? 0.88 : 1);
  const mult =
    cabin === "economy" ? 1
    : cabin === "premium_economy" ? 1.75
    : cabin === "business" ? (miles > 3000 && !domestic ? 4.3 : 2.7)
    : 7.0;
  return Math.round(econ * mult) * 100;
}

export function generateFlights(params: FlightSearchParams & { destinationId: string; bestMonths: number[] }): FlightSearchResult {
  const fetchedAt = new Date().toISOString();
  const routes = ROUTES[params.destinationId] ?? [];
  const warnings: string[] = [];
  if (!AIRPORTS[params.origin]) warnings.push(`Origin ${params.origin} is not in the demo airport list; distances are approximate.`);

  const makeOffers = (direction: "outbound" | "return", date: string, cheapestOnly = false): FlightOffer[] => {
    const offers: FlightOffer[] = [];
    for (const destAirport of params.destinationAirports) {
      const from = direction === "outbound" ? params.origin : destAirport;
      const to = direction === "outbound" ? destAirport : params.origin;
      const a = AIRPORTS[from] ?? AIRPORTS.LAX!;
      const z = AIRPORTS[to] ?? AIRPORTS.LAX!;
      const miles = Math.round(kmToMiles(haversineKm(a.lat, a.lng, z.lat, z.lng)));
      const domestic = a.country === "US" && z.country === "US";
      for (const r of routes) {
        const rnd = seeded(params.destinationId, from, to, date, r.carrier);
        const nonstop = r.nonstop.includes(params.origin);
        const stops = nonstop ? 0 : 1;
        const via = nonstop ? undefined : r.via === params.origin ? (CARRIERS[r.carrier]?.hubs[1] ?? r.via) : r.via;
        const durationMin = Math.round((miles / 480) * 60 + 40 + (stops ? 140 + rnd() * 60 : 0));
        const depHour = [7, 9, 11, 13, 16, 18, 21, 22][Math.floor(rnd() * 8)]!;
        const departTime = `${String(depHour).padStart(2, "0")}:${rnd() > 0.5 ? "15" : "45"}`;
        const tzDelta = ((TZ[to] ?? 0) - (TZ[from] ?? 0)) * 60;
        const arr = addMinutes(departTime, durationMin + tzDelta);
        const season = seasonFactor(date, params.bestMonths);
        const cabins = cheapestOnly ? (["economy"] as Cabin[]) : cabinsFor(r.carrier, miles).filter((c) => params.cabins.includes(c));
        const flightNo = `${r.carrier}${100 + Math.floor(rnd() * 800)}`;
        for (const cabin of cabins) {
          const cash = priceCash(miles, cabin, season, rnd, r.carrier, domestic) * (stops ? 0.92 : 1);
          offers.push({
            id: `demo-fl-${direction}-${from}-${to}-${date}-${r.carrier}-${cabin}`,
            provider: "PerkPilot Demo",
            dataKind: "demo",
            fetchedAt,
            direction,
            origin: from,
            destination: to,
            date,
            departTime,
            arriveTime: arr.time,
            arrivesNextDay: arr.dayOffset > 0,
            durationMin,
            stops,
            via,
            carrier: r.carrier,
            carrierName: CARRIERS[r.carrier]?.name ?? r.carrier,
            flightNumbers: stops ? [flightNo, `${r.carrier}${100 + Math.floor(rnd() * 800)}`] : [flightNo],
            cabin,
            cashPerPersonCents: Math.round(cash / 100) * 100,
            refundable: cabin === "business" || cabin === "first" ? rnd() > 0.4 : rnd() > 0.85,
            awards: cheapestOnly ? [] : buildAwards(r.carrier, cabin, miles, cash, from, to, rnd),
            bookingUrl: googleFlightsUrl(from, to, date, { cabin, adults: params.adults + params.children }),
          });
        }
      }
    }
    return offers;
  };

  const outbound = makeOffers("outbound", params.departDate);
  const ret = makeOffers("return", params.returnDate);

  const dateInsights: DateInsight[] = [];
  if (params.flexibleDays > 0) {
    const low = (os: FlightOffer[]) => Math.min(...os.filter((o) => o.cabin === "economy").map((o) => o.cashPerPersonCents));
    const baseOut = low(outbound);
    const baseRet = low(ret);
    for (let d = -params.flexibleDays; d <= params.flexibleDays; d++) {
      if (d === 0) continue;
      const od = shiftDate(params.departDate, d);
      const rd = shiftDate(params.returnDate, d);
      const lo = low(makeOffers("outbound", od, true));
      const lr = low(makeOffers("return", rd, true));
      dateInsights.push({ direction: "outbound", date: od, lowestEconomyCents: lo, deltaVsSelectedCents: lo - baseOut });
      dateInsights.push({ direction: "return", date: rd, lowestEconomyCents: lr, deltaVsSelectedCents: lr - baseRet });
    }
  }

  return { outbound, return: ret, dateInsights, provider: "PerkPilot Demo", dataKind: "demo", warnings };
}

/* ───────────── Multi-city legs (demo) ───────────── */

const REGIONAL: Array<{ test: (a: string, b: string) => boolean; carriers: string[] }> = [
  { test: (a, b) => AIRPORTS[a]?.country === "JP" && AIRPORTS[b]?.country === "JP", carriers: ["NH", "JL"] },
  { test: (a, b) => AIRPORTS[a]?.country === "US" && AIRPORTS[b]?.country === "US", carriers: ["UA", "DL", "AA", "AS", "WN"] },
  { test: (a, b) => ["FR", "GB", "IT", "PT", "IS"].includes(AIRPORTS[a]?.country ?? "") && ["FR", "GB", "IT", "PT", "IS"].includes(AIRPORTS[b]?.country ?? ""), carriers: ["BA", "AF", "TP", "FI"] },
];

/**
 * One-way inter-city legs between two catalogue destinations. Same honesty
 * rules as round trips: demo prices, estimated award pricing.
 */
export function generateLeg(p: LegSearchParams): FlightOffer[] {
  const fetchedAt = new Date().toISOString();
  const offers: FlightOffer[] = [];
  const fromRoutes = new Set((ROUTES[p.fromDestinationId ?? ""] ?? []).map((r) => r.carrier));
  const toRoutes = (ROUTES[p.toDestinationId ?? ""] ?? []).map((r) => r.carrier);
  for (const from of p.from) {
    for (const to of p.to) {
      const a = AIRPORTS[from];
      const z = AIRPORTS[to];
      if (!a || !z) continue;
      const miles = Math.round(kmToMiles(haversineKm(a.lat, a.lng, z.lat, z.lng)));
      const domestic = a.country === "US" && z.country === "US";
      const regional = REGIONAL.find((r) => r.test(from, to))?.carriers.filter((c) => CARRIERS[c]) ?? [];
      const shared = toRoutes.filter((c) => fromRoutes.has(c));
      const carriers = (regional.length ? regional : shared).slice(0, 4);
      const pool = carriers.length ? carriers.map((c) => ({ c, stops: 0 })) : toRoutes.slice(0, 3).map((c) => ({ c, stops: 1 }));
      for (const { c, stops: baseStops } of pool) {
        const rnd = seeded("leg", from, to, p.date, c);
        const stops = miles > 4500 ? Math.max(1, baseStops) : baseStops;
        const durationMin = Math.round((miles / 450) * 60 + 45 + (stops ? 150 : 0));
        const depHour = [7, 9, 11, 14, 17, 19][Math.floor(rnd() * 6)]!;
        const departTime = `${String(depHour).padStart(2, "0")}:${rnd() > 0.5 ? "10" : "40"}`;
        const arr = addMinutes(departTime, durationMin + ((TZ[to] ?? 0) - (TZ[from] ?? 0)) * 60);
        const flightNo = `${c}${100 + Math.floor(rnd() * 800)}`;
        const cabins = (miles < 1200 ? (["economy", "business"] as Cabin[]) : cabinsFor(c, miles)).filter((x) => p.cabins.includes(x));
        for (const cabin of cabins) {
          // One-way regional fares carry less of a round-trip discount.
          const cash = Math.round(priceCash(Math.max(miles, 300), cabin, 1.05, rnd, c, domestic) * (miles < 1200 ? 1.15 : 1) / 100) * 100;
          offers.push({
            id: `demo-leg-${from}-${to}-${p.date}-${c}-${cabin}`,
            provider: "PerkPilot Demo",
            dataKind: "demo",
            fetchedAt,
            direction: "leg",
            origin: from,
            destination: to,
            date: p.date,
            departTime,
            arriveTime: arr.time,
            arrivesNextDay: arr.dayOffset > 0,
            durationMin,
            stops,
            via: stops ? CARRIERS[c]?.hubs[0] : undefined,
            carrier: c,
            carrierName: CARRIERS[c]?.name ?? c,
            flightNumbers: [flightNo],
            cabin,
            cashPerPersonCents: cash,
            refundable: cabin !== "economy" && rnd() > 0.5,
            awards: buildAwards(c, cabin, miles, cash, from, to, rnd),
            bookingUrl: googleFlightsUrl(from, to, p.date, { cabin, adults: p.adults + p.children }),
          });
        }
      }
    }
  }
  return offers;
}
