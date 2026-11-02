import type {
  BenefitUsage,
  Cabin,
  Destination,
  ExperienceOffer,
  FlightOffer,
  HotelOffer,
  Household,
  TripRequest,
  TripStop,
} from "@/lib/domain/types";
import { CABIN_RANK } from "@/lib/domain/types";
import { combineConfidence } from "@/lib/calc/confidence";
import { CreditLedger } from "@/lib/calc/credits";
import { formatCpp, formatPoints, formatUSD } from "@/lib/calc/money";
import { daysBetween } from "@/lib/calc/periods";
import type { RulesRepository } from "@/lib/rules/repository";
import { destinationById } from "@/lib/providers/demo/catalog";
import { getExperienceProvider, getFlightProvider, getHotelProvider } from "@/lib/providers/registry";
import type { DateInsight } from "@/lib/providers/types";
import { householdBalances, type HouseholdBalances } from "./balances";
import { flightOptions, hotelOptions, type OptionContext } from "./options";
import type {
  AppliedCredit,
  CabinUpgrade,
  ComponentSlot,
  DateAlternative,
  OptimizationResult,
  PaymentOption,
  Plan,
  PlanComponent,
  PlannedExperience,
  SlotInfo,
  StrategyId,
  TransferInstruction,
  UnlockedBenefit,
} from "./types";

export interface OptimizeInput {
  request: TripRequest;
  household: Household;
  rules: RulesRepository;
  usage: BenefitUsage[];
  /** Date bookings would be charged — defaults to the rules' as-of date. */
  bookingDate?: string;
}

export interface PreparedData {
  slots: SlotInfo[];
  destinations: Destination[];
  /** Flight offers per flight slot. */
  flights: Record<ComponentSlot, FlightOffer[]>;
  /** Hotel offers per hotel slot. */
  hotels: Record<ComponentSlot, HotelOffer[]>;
  experiences: ExperienceOffer[];
  dateInsights: DateInsight[];
  providers: string[];
  warnings: string[];
  liveFlights: boolean;
}

const META: Record<StrategyId, { title: string; tagline: string }> = {
  savings: { title: "Maximum Savings", tagline: "Lowest out-of-pocket cash, redeeming points only above your minimum value." },
  luxury: { title: "Maximum Luxury", tagline: "Premium cabins and elevated stays, within your budget." },
  balanced: { title: "Balanced Value", tagline: "The best blend of point value, cash savings and experience." },
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

import { buildSlots, tripStops } from "./slots";
export { buildSlots, tripStops };

/* ───────────────────────────── Data fetch ───────────────────────────── */

export async function fetchTripData(request: TripRequest, household: Household): Promise<PreparedData> {
  const slots = buildSlots(request);
  const stops = tripStops(request);
  const destinations = stops.map((s) => {
    const d = destinationById(s.destinationId);
    if (!d) throw new Error(`Unknown destination: ${s.destinationId}`);
    return d;
  });
  const first = destinations[0]!;
  const last = destinations[destinations.length - 1]!;
  const preferred = request.cabin ?? household.preferences.cabin;
  const cabins: Cabin[] = (["economy", "premium_economy", "business", "first"] as Cabin[]).filter(
    (c) => CABIN_RANK[c] <= Math.max(CABIN_RANK[preferred] + 1, CABIN_RANK.business),
  );
  const flightProvider = getFlightProvider();
  const hotelProvider = getHotelProvider();
  const expProvider = getExperienceProvider();
  const styles = request.styles ?? household.preferences.styles;
  const base = { origin: request.origin, departDate: request.departDate, returnDate: request.returnDate, adults: request.adults, children: request.children, cabins, flexibleDays: request.flexibleDays };

  const multi = destinations.length > 1;
  const [outRes, retRes, legResults, hotelLists, expLists] = await Promise.all([
    flightProvider.searchFlights({ ...base, destinationAirports: first.airports, destinationId: first.id }),
    multi ? flightProvider.searchFlights({ ...base, flexibleDays: 0, destinationAirports: last.airports, destinationId: last.id }) : Promise.resolve(null),
    Promise.all(
      slots
        .filter((s) => s.slot.startsWith("leg-"))
        .map(async (s) => {
          const from = destinationById(s.fromDestinationId!)!;
          const to = destinationById(s.toDestinationId!)!;
          const res = flightProvider.searchLeg
            ? await flightProvider.searchLeg({ from: from.airports, to: to.airports, date: s.date, adults: request.adults, children: request.children, cabins, fromDestinationId: from.id, toDestinationId: to.id })
            : { offers: [], warnings: [`${flightProvider.info().name} cannot search one-way legs`] };
          return { slot: s.slot, ...res };
        }),
    ),
    Promise.all(slots.filter((s) => s.kind === "hotel").map((s) => hotelProvider.searchHotels({ destinationId: s.destinationId, checkIn: s.checkIn!, checkOut: s.checkOut!, guests: request.adults + request.children }).then((h) => ({ slot: s.slot, hotels: h.map((x) => ({ ...x, destinationId: x.destinationId ?? s.destinationId })) })))),
    Promise.all(destinations.map((d) => expProvider.searchExperiences({ destinationId: d.id, styles }).then((list) => list.map((e) => ({ ...e, destinationId: e.destinationId ?? d.id }))))),
  ]);

  const maxStops = household.preferences.maxStops;
  const stopFilter = (o: FlightOffer) => o.stops <= Math.max(maxStops, 1);
  const flights: Record<ComponentSlot, FlightOffer[]> = {
    outbound: outRes.outbound.filter(stopFilter),
    return: (retRes ?? outRes).return.filter(stopFilter),
  };
  const warnings = [...outRes.warnings, ...(retRes?.warnings ?? [])];
  for (const l of legResults) {
    flights[l.slot] = l.offers.filter(stopFilter).map((o) => ({ ...o, direction: "leg" as const }));
    warnings.push(...l.warnings);
  }
  return {
    slots,
    destinations,
    flights,
    hotels: Object.fromEntries(hotelLists.map((h) => [h.slot, h.hotels])),
    experiences: expLists.flat(),
    dateInsights: outRes.dateInsights,
    providers: [flightProvider.info().name, hotelProvider.info().name, expProvider.info().name],
    warnings: [...new Set(warnings)],
    liveFlights: outRes.dataKind !== "demo",
  };
}

/* ───────────────────────────── Scoring ───────────────────────────── */

function valuation(household: Household, programId: string): number {
  return household.valuations[programId] ?? (programId.includes("-mr") || programId.includes("-ur") ? 1.5 : 1.2);
}

function pointsOpportunity(o: PaymentOption, household: Household): number {
  return o.draws.reduce((a, d) => a + d.points * valuation(household, d.programId), 0);
}

function allowedFor(strategy: StrategyId, o: PaymentOption, household: Household, preferredCabin: Cabin): boolean {
  if (strategy === "savings") {
    if (o.cpp !== null && o.draws.length && o.cpp < household.minRedemptionCpp) return false;
    if (o.cabin && CABIN_RANK[o.cabin] > CABIN_RANK[preferredCabin]) return false;
  }
  if (strategy === "luxury" && !o.slot.startsWith("hotel") && o.cabin && CABIN_RANK[o.cabin] < Math.min(CABIN_RANK[preferredCabin], CABIN_RANK.business)) {
    // Luxury never downgrades below business unless nothing else is feasible (handled by fallback).
    return false;
  }
  return true;
}

function flexBonus(o: PaymentOption, household: Household): number {
  return household.preferences.preferRefundable && o.flexibility !== "nonrefundable" ? 4000 : 0;
}

function standaloneScore(strategy: StrategyId, o: PaymentOption, household: Household, credit: number): number {
  const cash = o.cashCents - credit;
  const opp = pointsOpportunity(o, household);
  switch (strategy) {
    case "savings":
      return cash + 0.05 * opp - 0.02 * o.qualityCents;
    case "luxury":
      return -(o.qualityCents + o.perksValueCents + flexBonus(o, household)) + 0.2 * (cash + opp);
    case "balanced":
      return cash + opp - o.perksValueCents - 0.6 * o.qualityCents - flexBonus(o, household);
  }
}

interface ComboEval {
  score: number;
  cash: number;
  credits: Map<ComponentSlot, AppliedCredit[]>;
  ledger: CreditLedger;
  feasible: boolean;
}

function toApplied(rules: RulesRepository, list: ReturnType<CreditLedger["apply"]>): AppliedCredit[] {
  return list.map((c) => {
    const b = rules.benefit(c.benefitId)!;
    return { benefitId: c.benefitId, name: b.name, cardId: b.cardId, travelerId: c.travelerId, cents: c.usableCents, periodKey: c.periodKey, periodEnd: c.periodEnd };
  });
}

function evaluateCombo(
  strategy: StrategyId,
  combo: Record<ComponentSlot, PaymentOption>,
  base: CreditLedger,
  balances: HouseholdBalances,
  household: Household,
  rules: RulesRepository,
  budget: number,
  complete = true,
): ComboEval {
  const slots = Object.keys(combo);
  const draws = slots.flatMap((s) => combo[s]!.draws);
  const feasible = draws.length === 0 || balances.allocate(draws).feasible;
  const ledger = base.clone();
  const credits = new Map<ComponentSlot, AppliedCredit[]>();
  let cash = 0;
  let score = 0;
  // Apply hotels first so program-specific credits (FHR/Edit) are matched before generic travel credits.
  const order = [...slots.filter((s) => s.startsWith("hotel")), ...slots.filter((s) => !s.startsWith("hotel"))];
  for (const slot of order) {
    const o = combo[slot]!;
    const applied = o.creditContext && o.cashCents > 0 ? toApplied(rules, ledger.apply(o.creditContext, { cardId: o.creditCardId })) : [];
    credits.set(slot, applied);
    const c = applied.reduce((a, x) => a + x.cents, 0);
    cash += o.cashCents - c;
    score += standaloneScore(strategy, o, household, c);
  }
  if (complete && strategy === "luxury" && budget > 0 && cash > budget) score += (cash - budget) * 5;
  return { score, cash, credits, ledger, feasible };
}

/**
 * Find the best combination of one option per slot. Exhaustive when the space
 * is small (single-city trips), otherwise a beam search that keeps the best
 * feasible partial plans — hotels first, then flights.
 */
function searchBest(
  strategy: StrategyId,
  candidates: Record<ComponentSlot, PaymentOption[]>,
  ledger: CreditLedger,
  balances: HouseholdBalances,
  household: Household,
  rules: RulesRepository,
  budget: number,
): { combo: Record<ComponentSlot, PaymentOption>; ev: ComboEval } | null {
  const slots = Object.keys(candidates).sort((a, b) => Number(!a.startsWith("hotel")) - Number(!b.startsWith("hotel")));
  if (slots.some((s) => !candidates[s]!.length)) return null;
  const space = slots.reduce((a, s) => a * candidates[s]!.length, 1);
  let best: { combo: Record<ComponentSlot, PaymentOption>; ev: ComboEval } | null = null;
  if (space <= 30_000) {
    const walk = (i: number, combo: Record<ComponentSlot, PaymentOption>) => {
      if (i === slots.length) {
        const ev = evaluateCombo(strategy, combo, ledger, balances, household, rules, budget);
        if (ev.feasible && (!best || ev.score < best.ev.score)) best = { combo: { ...combo }, ev };
        return;
      }
      for (const o of candidates[slots[i]!]!) {
        combo[slots[i]!] = o;
        walk(i + 1, combo);
      }
      delete combo[slots[i]!];
    };
    walk(0, {});
    return best;
  }
  // Wider beams for typical trips; narrower for 3–4 city trips to bound CPU per request.
  const BEAM = slots.length > 6 ? 60 : 160;
  let beam: Array<Record<ComponentSlot, PaymentOption>> = [{}];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const complete = i === slots.length - 1;
    const next: Array<{ combo: Record<ComponentSlot, PaymentOption>; ev: ComboEval }> = [];
    for (const partial of beam) {
      for (const o of candidates[slot]!) {
        const combo = { ...partial, [slot]: o };
        const ev = evaluateCombo(strategy, combo, ledger, balances, household, rules, budget, complete);
        if (ev.feasible) next.push({ combo, ev });
      }
    }
    next.sort((a, b) => a.ev.score - b.ev.score);
    if (complete) return next[0] ?? null;
    beam = next.slice(0, BEAM).map((x) => x.combo);
    if (!beam.length) return null;
  }
  return best;
}

function prune(strategy: StrategyId, opts: PaymentOption[], household: Household, preferredCabin: Cabin, k: number): PaymentOption[] {
  const ranked = opts
    .filter((o) => allowedFor(strategy, o, household, preferredCabin))
    .map((o) => ({ o, s: standaloneScore(strategy, o, household, 0) }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.o);
  // Keep the overall top-k plus the best few per funding source, so the
  // combination search can trade points between components when balances bind.
  const keep = new Set(ranked.slice(0, k));
  const perKey = new Map<string, number>();
  for (const o of ranked) {
    const key = o.draws.length ? o.draws.map((d) => d.programId).join("+") : "cash";
    const n = perKey.get(key) ?? 0;
    if (n < 3) {
      keep.add(o);
      perKey.set(key, n + 1);
    }
  }
  return [...keep];
}

/* ───────────────────────────── Experiences ───────────────────────────── */

function planExperiences(
  strategy: StrategyId,
  experiences: ExperienceOffer[],
  household: Household,
  request: TripRequest,
  nights: number,
  party: number,
  ledger: CreditLedger,
  rules: RulesRepository,
  bookingDate: string,
): PlannedExperience[] {
  const styles = new Set(request.styles?.length ? request.styles : household.preferences.styles);
  const perDay = { relaxed: 1, balanced: 1.4, packed: 2 }[household.preferences.pace];
  const count = Math.max(2, Math.min(experiences.length, Math.round(perDay * Math.max(1, nights - 1) + 1)));
  const scored = experiences.map((e) => {
    const match = e.styles.filter((s) => styles.has(s)).length;
    let s = match * 30 + e.rating * 10;
    if (strategy === "luxury") s += e.premium ? 28 : 0;
    if (strategy === "savings") s -= e.pricePerPersonCents / 1000 + (e.premium ? 10 : 0);
    if (strategy === "balanced") s -= e.pricePerPersonCents / 2500 - (e.premium ? 6 : 0);
    return { e, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const picked: ExperienceOffer[] = [];
  let dining = 0;
  let premium = 0;
  const maxPremium = strategy === "savings" ? 0 : strategy === "balanced" ? 2 : Infinity;
  for (const { e } of scored) {
    if (picked.length >= count) break;
    if (e.premium) {
      if (premium >= maxPremium) continue;
      premium++;
    }
    if (e.category === "dining") {
      if (dining >= Math.max(1, nights - 1)) continue;
      dining++;
    }
    picked.push(e);
  }
  const owned = new Set(household.travelers.flatMap((t) => t.cards.map((c) => c.cardId)));
  return picked.map((e) => {
    const total = e.pricePerPersonCents * party;
    const component = e.category === "dining" ? "dining" : "experience";
    const channel = e.tags.includes("resy") ? "resy" : e.tags.includes("sapphire_tables") ? "opentable" : e.tags.includes("stubhub") ? "stubhub" : "direct";
    const applied = total > 0 && e.tags.length
      ? toApplied(rules, ledger.apply({ chargeDate: bookingDate, component, channel, tags: e.tags, spendCents: total }))
      : [];
    const creditCents = applied.reduce((a, c) => a + c.cents, 0);
    let cardTip: string | null = null;
    let payWithCardId: string | undefined;
    if (applied.length) {
      const c = applied[0]!;
      payWithCardId = c.cardId;
      cardTip = `Pay with ${rules.card(c.cardId)?.name.split("®")[0]} — ${c.name} may cover up to ${formatUSD(c.cents)} if the merchant qualifies.`;
    } else if (component === "dining" && owned.has("chase-sapphire-reserve")) {
      payWithCardId = "chase-sapphire-reserve";
      cardTip = "Pay with Sapphire Reserve for its dining multiplier. No card credit is assumed for this venue.";
    }
    return { experience: e, totalCents: total, credits: applied, cashAfterCreditsCents: total - creditCents, cardTip, payWithCardId };
  });
}

/* ───────────────────────────── Plan assembly ───────────────────────────── */

function describeChoice(info: SlotInfo, chosen: PaymentOption, all: PaymentOption[], household: Household, rules: RulesRepository): string {
  const what = info.kind === "hotel" ? info.label.toLowerCase() : info.slot === "outbound" || info.slot === "return" ? info.label.toLowerCase() : `${info.label} flight`;
  const sameOffer = all.filter((o) => o.offerId === chosen.offerId);
  const cash = sameOffer.find((o) => o.method === "cash");
  if (chosen.method === "cash" || chosen.method === "program_booking") {
    const bestPoints = sameOffer.filter((o) => o.cpp !== null && o.draws.length).sort((a, b) => (b.cpp ?? 0) - (a.cpp ?? 0))[0];
    const perks = chosen.perksValueCents ? ` and unlocks about ${formatUSD(chosen.perksValueCents)} in guaranteed perks` : "";
    if (bestPoints) {
      return `For the ${what}, paying ${formatUSD(chosen.cashCents)}${chosen.method === "program_booking" ? ` via ${chosen.label}` : ""} beats redeeming points — the best redemption (${bestPoints.label}) yields only ${formatCpp(bestPoints.cpp)}/pt versus your ${formatCpp(valuation(household, bestPoints.draws[0]!.programId))} valuation${perks}.`;
    }
    return `For the ${what}, paying ${formatUSD(chosen.cashCents)}${chosen.method === "program_booking" ? ` via ${chosen.label}` : ""} is the strongest option${perks}.`;
  }
  const pts = chosen.draws.map((d) => `${formatPoints(d.points)} ${rules.programName(d.programId)}`).join(" + ");
  const saved = (cash?.cashCents ?? chosen.retailCents) - chosen.cashCents;
  const v = valuation(household, chosen.draws[0]!.programId);
  return `For the ${what}, ${chosen.label} uses ${pts} at ${formatCpp(chosen.cpp)}/pt (your baseline: ${formatCpp(v)}), avoiding about ${formatUSD(saved)} in cash${chosen.awardOnlyChargesCents ? ` after ${formatUSD(chosen.awardOnlyChargesCents)} of surcharges` : ""}.`;
}

/** Premium-cabin analysis: what moving each flight up one cabin would cost and return. */
function cabinUpgrades(
  combo: Record<ComponentSlot, PaymentOption>,
  slots: SlotInfo[],
  flights: Record<ComponentSlot, FlightOffer[]>,
  allOptions: Record<ComponentSlot, PaymentOption[]>,
  balances: HouseholdBalances,
  household: Household,
  rules: RulesRepository,
  party: number,
): CabinUpgrade[] {
  const out: CabinUpgrade[] = [];
  const comfort = household.preferences.comfort;
  const perHour: Record<Cabin, number> = { economy: 0, premium_economy: comfort.premiumEconomyPerHourCents, business: comfort.businessPerHourCents, first: comfort.firstPerHourCents };
  for (const info of slots.filter((s) => s.kind === "flight")) {
    const cur = combo[info.slot];
    if (!cur?.cabin) continue;
    const offer = flights[info.slot]?.find((f) => f.id === cur.offerId);
    if (!offer) continue;
    const higher = (flights[info.slot] ?? [])
      .filter((f) => f.carrier === offer.carrier && f.origin === offer.origin && f.destination === offer.destination && f.date === offer.date && CABIN_RANK[f.cabin] > CABIN_RANK[offer.cabin])
      .sort((a, b) => CABIN_RANK[a.cabin] - CABIN_RANK[b.cabin])[0];
    if (!higher) continue;
    const otherDraws = Object.entries(combo).filter(([s]) => s !== info.slot).flatMap(([, o]) => o.draws);
    const candidates = (allOptions[info.slot] ?? [])
      .filter((o) => o.offerId === higher.id && balances.allocate([...otherDraws, ...o.draws]).feasible)
      .sort((a, b) => standaloneScore("balanced", a, household, 0) - standaloneScore("balanced", b, household, 0));
    const up = candidates[0];
    if (!up) continue;
    const extraPoints: Record<string, number> = {};
    for (const d of up.draws) extraPoints[d.programId] = (extraPoints[d.programId] ?? 0) + d.points;
    for (const d of cur.draws) extraPoints[d.programId] = (extraPoints[d.programId] ?? 0) - d.points;
    const totalExtraPts = Object.values(extraPoints).reduce((a, b) => a + b, 0);
    const extraCash = up.cashCents - cur.cashCents;
    const extraRetail = up.retailCents - cur.retailCents;
    const marginalCpp = totalExtraPts > 0 ? Math.round(((extraRetail - extraCash) / totalExtraPts) * 100) / 100 : null;
    const extraPointsValue = Object.entries(extraPoints).reduce((a, [k, v]) => a + v * valuation(household, k), 0);
    const comfortValue = (perHour[higher.cabin] - perHour[offer.cabin]) * (offer.durationMin / 60) * party;
    const effectiveCost = extraCash + extraPointsValue;
    const verdict: CabinUpgrade["verdict"] = effectiveCost <= comfortValue ? "worth_it" : effectiveCost <= comfortValue * 1.5 ? "consider" : "poor_value";
    const ptsText = Object.entries(extraPoints).filter(([, v]) => v !== 0).map(([k, v]) => `${v > 0 ? "+" : ""}${formatPoints(v)} ${rules.programName(k)}`).join(", ");
    out.push({
      slot: info.slot,
      fromCabin: offer.cabin,
      toCabin: higher.cabin,
      optionLabel: up.label,
      extraCashCents: extraCash,
      extraPoints,
      extraRetailCents: extraRetail,
      marginalCpp,
      verdict,
      note: `${info.label}: ${higher.cabin.replace("_", " ")} via ${up.label} costs ${extraCash >= 0 ? "+" : "−"}${formatUSD(Math.abs(extraCash))} cash${ptsText ? ` and ${ptsText}` : ""}${marginalCpp !== null ? ` — the extra points are worth ${formatCpp(marginalCpp)} each` : ""}. Your comfort setting values the upgrade at ${formatUSD(Math.round(comfortValue))}.`,
    });
  }
  return out;
}

interface PlanCtx extends OptionContext {
  request: TripRequest;
  experiences: ExperienceOffer[];
  balances: HouseholdBalances;
  budget: number;
  slots: SlotInfo[];
  flights: Record<ComponentSlot, FlightOffer[]>;
}

function buildPlan(strategy: StrategyId, combo: Record<ComponentSlot, PaymentOption>, ev: ComboEval, allOptions: Record<ComponentSlot, PaymentOption[]>, ctx: PlanCtx): Plan {
  const { rules, household } = ctx;
  const components = {} as Record<ComponentSlot, PlanComponent>;
  for (const info of ctx.slots) {
    const credits = ev.credits.get(info.slot) ?? [];
    const o = combo[info.slot]!;
    components[info.slot] = { option: o, credits, cashAfterCreditsCents: o.cashCents - credits.reduce((a, c) => a + c.cents, 0) };
  }
  // Experiences per stay, sized by that stay's nights.
  const experiences = ctx.slots
    .filter((s) => s.kind === "hotel")
    .flatMap((stay) =>
      planExperiences(
        strategy,
        ctx.experiences.filter((e) => !e.destinationId || e.destinationId === stay.destinationId),
        household,
        ctx.request,
        stay.nights ?? ctx.nights,
        ctx.party,
        ev.ledger,
        rules,
        ctx.bookingDate,
      ),
    );

  const options = ctx.slots.map((s) => combo[s.slot]!);
  const draws = options.flatMap((o) => o.draws);
  const alloc = ctx.balances.allocate(draws);
  const pointsByProgram: Record<string, number> = {};
  for (const d of draws) pointsByProgram[d.programId] = (pointsByProgram[d.programId] ?? 0) + d.points;

  const bookingCredits = Object.values(components).flatMap((c) => c.credits);
  const expCredits = experiences.flatMap((e) => e.credits);
  const creditsCents = [...bookingCredits, ...expCredits].reduce((a, c) => a + c.cents, 0);
  const retailCents = options.reduce((a, o) => a + o.retailCents, 0) + experiences.reduce((a, e) => a + e.totalCents, 0);
  const cashCents = Object.values(components).reduce((a, c) => a + c.cashAfterCreditsCents, 0) + experiences.reduce((a, e) => a + e.cashAfterCreditsCents, 0);
  const perksValueCents = options.reduce((a, o) => a + o.perksValueCents, 0);
  const pointsValue = Math.round(draws.reduce((a, d) => a + d.points * valuation(household, d.programId), 0));

  const balances = household.travelers.flatMap((t) =>
    t.balances
      .filter((b) => alloc.allocations.some((a) => a.programId === b.programId && a.travelerId === t.id))
      .map((b) => {
        const used = alloc.allocations.filter((a) => a.programId === b.programId && a.travelerId === t.id).reduce((s, a) => s + a.points, 0);
        return { programId: b.programId, travelerId: t.id, before: b.points, after: b.points - used };
      }),
  );

  // Transfers — always explicit, never automatic.
  const transfers: TransferInstruction[] = [];
  for (const info of ctx.slots) {
    const o = combo[info.slot]!;
    if (!o.transfer) continue;
    const partner = rules.dataset.transferPartners.find((p) => p.id === o.transfer!.partnerId);
    const holder = alloc.allocations.find((a) => a.programId === o.transfer!.fromProgram)?.travelerId ?? household.travelers[0]!.id;
    transfers.push({
      fromProgram: o.transfer.fromProgram,
      toProgram: o.transfer.toProgram,
      travelerId: holder,
      sourcePoints: o.transfer.sourcePoints,
      partnerPointsReceived: o.transfer.partnerPointsReceived,
      ratioText: partner ? `${partner.ratioFrom.toLocaleString()}:${partner.ratioTo.toLocaleString()}` : "",
      bonusPercent: o.transfer.bonusPercent,
      transferTime: partner?.transferTime ?? "",
      recipientNote:
        partner?.recipient === "cardmember_or_authorized_user"
          ? `Transfer into a ${rules.programName(o.transfer.toProgram)} account in ${ctx.balances.nameOf(holder)}'s name (or an eligible authorized user's).`
          : `Transfer into a ${rules.programName(o.transfer.toProgram)} account in ${ctx.balances.nameOf(holder)}'s name.`,
      forSlot: info.slot,
    });
  }

  const benefits: UnlockedBenefit[] = [];
  for (const c of [...bookingCredits, ...expCredits]) {
    benefits.push({ benefitId: c.benefitId, name: c.name, cardId: c.cardId, valueCents: c.cents, kind: "credit", guaranteed: true, note: `Uses ${formatUSD(c.cents)} of this period's credit (period ends ${c.periodEnd}).` });
  }
  for (const info of ctx.slots.filter((s) => s.kind === "hotel")) {
    for (const p of combo[info.slot]!.perks) {
      if (!p.benefitId) continue;
      benefits.push({ benefitId: p.benefitId, name: ctx.slots.filter((s) => s.kind === "hotel").length > 1 ? `${p.name} (${info.label.replace("Hotel in ", "")})` : p.name, cardId: rules.benefit(p.benefitId)?.cardId ?? "", valueCents: p.counted ? p.valueCents : undefined, kind: "perk", guaranteed: p.kind === "guaranteed", note: p.kind === "guaranteed" ? "Guaranteed program benefit" : "Subject to availability — not counted in value" });
    }
  }
  const owned = new Set(household.travelers.flatMap((t) => t.cards.map((c) => c.cardId)));
  for (const lounge of rules.benefits().filter((b) => b.category === "lounge" && owned.has(b.cardId))) {
    benefits.push({ benefitId: lounge.id, name: lounge.name, cardId: lounge.cardId, kind: "access", guaranteed: false, note: "Eligibility depends on airport, airline and guest policy." });
  }
  const flightOpts = ctx.slots.filter((s) => s.kind === "flight").map((s) => combo[s.slot]!);
  const flightPaidWith = new Set(flightOpts.map((o) => o.payWithCardId ?? o.earn?.cardId ?? (o.bankProgramId === "chase-ur" ? "chase-sapphire-reserve" : o.bankProgramId === "amex-mr" ? "amex-platinum" : undefined)));
  for (const prot of rules.benefits().filter((b) => b.category === "insurance" && owned.has(b.cardId) && flightPaidWith.has(b.cardId))) {
    benefits.push({ benefitId: prot.id, name: prot.name, cardId: prot.cardId, kind: "protection", guaranteed: false, note: "Applies when the fare is paid with this card — terms and exclusions apply." });
  }
  for (const o of options) {
    if (o.transfer?.bonusPercent) {
      benefits.push({ benefitId: o.transfer.bonusId ?? "", name: `${o.transfer.bonusPercent}% transfer bonus to ${rules.programName(o.transfer.toProgram)}`, cardId: "", kind: "bonus", guaranteed: false, note: "Promotion window applies." });
    }
  }
  if (owned.has("amex-platinum")) {
    const fee = rules.benefits({ cardId: "amex-platinum" }).find((b) => b.category === "airline_credit");
    if (fee) benefits.push({ benefitId: fee.id, name: fee.name, cardId: fee.cardId, kind: "credit", guaranteed: false, note: "Covers incidental fees (bags, seats) on your selected airline only — not counted in savings." });
  }

  const rationale = ctx.slots.map((s) => describeChoice(s, combo[s.slot]!, allOptions[s.slot] ?? [], household, rules));
  const expCreditTotal = expCredits.reduce((a, c) => a + c.cents, 0);
  if (expCreditTotal) rationale.push(`Experiences: card credits may offset about ${formatUSD(expCreditTotal)} where the venue or ticket platform qualifies.`);

  const warnings = [...new Set(options.flatMap((o) => o.warnings))];
  if (!alloc.feasible) warnings.push(alloc.reason ?? "Points allocation could not be satisfied.");
  const withinBudget = !ctx.budget || ev.cash <= ctx.budget;
  if (!withinBudget) warnings.push(`Bookings exceed your ${formatUSD(ctx.budget)} cash budget.`);

  return {
    strategy,
    ...META[strategy],
    components,
    experiences,
    totals: {
      retailCents,
      cashCents,
      creditsCents,
      perksValueCents,
      pointsByProgram,
      pointsValueAtBaselineCents: pointsValue,
      estimatedSavingsCents: Math.max(0, retailCents - cashCents),
      effectiveCostCents: cashCents + pointsValue - perksValueCents,
    },
    balances,
    transfers,
    householdSteps: alloc.steps,
    benefits,
    rationale,
    warnings,
    confidence: combineConfidence(options.map((o) => o.confidence)),
    withinBudget,
    upgrades: cabinUpgrades(combo, ctx.slots, ctx.flights, allOptions, ctx.balances, household, rules, ctx.party),
  };
}

/* ───────────────────────────── Public API ───────────────────────────── */

export function optimizeWithData(input: OptimizeInput, data: PreparedData): OptimizationResult {
  const { request, household, rules, usage } = input;
  const bookingDate = input.bookingDate ?? rules.asOf;
  const nights = Math.max(1, daysBetween(request.departDate, request.returnDate));
  const party = Math.max(1, request.adults + request.children);
  const rooms = Math.max(1, Math.ceil(party / 2));
  const ctx: OptionContext = { rules, household, party, rooms, nights, bookingDate };
  const balances = householdBalances(household, rules);
  const preferredCabin = request.cabin ?? household.preferences.cabin;
  const budget = request.budgetCents ?? household.cashBudgetCents ?? 0;

  const allOptions: Record<ComponentSlot, PaymentOption[]> = {};
  for (const info of data.slots) {
    allOptions[info.slot] =
      info.kind === "flight"
        ? (data.flights[info.slot] ?? []).flatMap((f) => flightOptions(f, ctx, info.slot))
        : (data.hotels[info.slot] ?? []).flatMap((h) => hotelOptions(h, { ...ctx, nights: info.nights ?? nights }, info.slot));
    if (!allOptions[info.slot]!.length) throw new Error(`No bookable options were found for ${info.label.toLowerCase()}.`);
  }

  const ledger = new CreditLedger(rules.benefits({ date: bookingDate }), household, usage);
  const plans = {} as Record<StrategyId, Plan>;
  const multi = data.slots.length > 3;
  const k = multi ? 7 : 10;

  for (const strategy of ["savings", "balanced", "luxury"] as StrategyId[]) {
    const candidates = (relaxed: boolean) =>
      Object.fromEntries(
        data.slots.map((s) => {
          const p = prune(strategy, allOptions[s.slot]!, household, preferredCabin, k);
          return [s.slot, p.length || !relaxed ? p : prune("balanced", allOptions[s.slot]!, household, preferredCabin, k)];
        }),
      );
    let best = searchBest(strategy, candidates(false), ledger, balances, household, rules, budget) ?? searchBest(strategy, candidates(true), ledger, balances, household, rules, budget);
    if (!best) {
      // Last resort: cheapest cash everywhere.
      const combo = Object.fromEntries(data.slots.map((s) => [s.slot, allOptions[s.slot]!.filter((o) => o.method === "cash").sort((a, b) => a.cashCents - b.cashCents)[0] ?? allOptions[s.slot]![0]!]));
      best = { combo, ev: evaluateCombo(strategy, combo, ledger, balances, household, rules, budget) };
    }
    plans[strategy] = buildPlan(strategy, best.combo, best.ev, allOptions, { ...ctx, request, experiences: data.experiences, balances, budget, slots: data.slots, flights: data.flights });
  }

  // Keep stored results compact: best few options per offer.
  const chosenIds = new Set(Object.values(plans).flatMap((p) => Object.values(p.components).map((c) => c.option.id)));
  const compact = (opts: PaymentOption[]) => {
    const byOffer = new Map<string, PaymentOption[]>();
    for (const o of opts) byOffer.set(o.offerId, [...(byOffer.get(o.offerId) ?? []), o]);
    const out: PaymentOption[] = [];
    for (const list of byOffer.values()) {
      const ranked = list.map((o) => ({ o, s: standaloneScore("balanced", o, household, 0) })).sort((a, b) => a.s - b.s).map((x) => x.o);
      out.push(...new Set([...ranked.slice(0, 3), ...list.filter((o) => o.method === "cash" || chosenIds.has(o.id))]));
    }
    return out;
  };

  const anyLive = data.liveFlights || Object.values(data.hotels).flat().some((h) => h.dataKind === "live") || data.experiences.some((e) => e.dataKind === "live");
  return {
    id: globalThis.crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    request,
    destination: data.destinations[0]!,
    destinations: data.destinations,
    slots: data.slots,
    nights,
    party,
    rooms,
    plans,
    recommended: "balanced",
    flights: data.flights,
    hotels: Object.values(data.hotels).flat(),
    experiences: data.experiences,
    options: Object.fromEntries(Object.entries(allOptions).map(([s, o]) => [s, compact(o)])),
    dateInsights: data.dateInsights,
    dateAlternatives: [],
    dataNotice: anyLive
      ? "Some prices come from live providers and may change or expire; anything labelled \"Demo estimate\" is modelled. Award space is never confirmed unless marked so. Verify every booking on the official site before transferring points."
      : "Demonstration data: fares, award prices and hotel rates are illustrative estimates generated by PerkPilot's demo model — not live quotes. Award availability is never confirmed. Verify every booking on the official site before transferring points.",
    rulesVersion: rules.dataset.version,
    providers: data.providers,
    warnings: data.warnings,
  };
}

/** Shifts tried for flexible-date optimization (same trip length). */
export function dateShifts(flexibleDays: number): number[] {
  if (flexibleDays <= 0) return [];
  return [...new Set([-flexibleDays, -1, 1, flexibleDays])].filter((d) => d !== 0).sort((a, b) => a - b);
}

/** Flexible-date re-optimization is skipped when the base run is already this slow (ms). */
const FLEX_TIME_BUDGET_MS = 1_200;

export async function optimizeTrip(input: OptimizeInput): Promise<OptimizationResult> {
  const started = Date.now();
  const data = await fetchTripData(input.request, input.household);
  const result = optimizeWithData(input, data);
  // Phase 4 — flexible dates: fully re-optimize nearby date shifts. Limited to
  // demo/cached flight data so live providers aren't hammered with searches.
  // Bounded work: multi-city trips try only the nearest shifts, and nothing runs
  // when the base optimization already used most of the time budget.
  const multi = (input.request.stops?.length ?? 1) > 2;
  const shifts = dateShifts(multi ? Math.min(1, input.request.flexibleDays) : input.request.flexibleDays);
  if (shifts.length && !data.liveFlights && Date.now() - started < FLEX_TIME_BUDGET_MS) {
    const alternatives = await Promise.all(
      shifts.map(async (shift): Promise<DateAlternative | null> => {
        const request: TripRequest = { ...input.request, departDate: addDays(input.request.departDate, shift), returnDate: addDays(input.request.returnDate, shift), flexibleDays: 0 };
        try {
          const alt = optimizeWithData({ ...input, request }, await fetchTripData(request, input.household));
          return {
            shiftDays: shift,
            departDate: request.departDate,
            returnDate: request.returnDate,
            plans: Object.fromEntries(Object.entries(alt.plans).map(([k, p]) => [k, { cashCents: p.totals.cashCents, effectiveCostCents: p.totals.effectiveCostCents, pointsByProgram: p.totals.pointsByProgram }])) as DateAlternative["plans"],
          };
        } catch {
          return null;
        }
      }),
    );
    result.dateAlternatives = alternatives.filter((a): a is DateAlternative => a !== null);
  }
  return result;
}
