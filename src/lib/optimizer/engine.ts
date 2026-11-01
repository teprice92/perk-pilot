import type {
  BenefitUsage,
  Cabin,
  ExperienceOffer,
  FlightOffer,
  HotelOffer,
  Household,
  TripRequest,
} from "@/lib/domain/types";
import { CABIN_RANK } from "@/lib/domain/types";
import { combineConfidence } from "@/lib/calc/confidence";
import { CreditLedger } from "@/lib/calc/credits";
import { formatCpp, formatPoints, formatUSD } from "@/lib/calc/money";
import { daysBetween } from "@/lib/calc/periods";
import type { RulesRepository } from "@/lib/rules/repository";
import { destinationById } from "@/lib/providers/demo/destinations";
import { getExperienceProvider, getFlightProvider, getHotelProvider } from "@/lib/providers/registry";
import type { DateInsight } from "@/lib/providers/types";
import { householdBalances, type HouseholdBalances } from "./balances";
import { flightOptions, hotelOptions, type OptionContext } from "./options";
import type {
  AppliedCredit,
  ComponentSlot,
  OptimizationResult,
  PaymentOption,
  Plan,
  PlanComponent,
  PlannedExperience,
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
  outbound: FlightOffer[];
  ret: FlightOffer[];
  hotels: HotelOffer[];
  experiences: ExperienceOffer[];
  dateInsights: DateInsight[];
  providers: string[];
  warnings: string[];
}

const META: Record<StrategyId, { title: string; tagline: string }> = {
  savings: { title: "Maximum Savings", tagline: "Lowest out-of-pocket cash, redeeming points only above your minimum value." },
  luxury: { title: "Maximum Luxury", tagline: "Premium cabins and elevated stays, within your budget." },
  balanced: { title: "Balanced Value", tagline: "The best blend of point value, cash savings and experience." },
};

/* ───────────────────────────── Data fetch ───────────────────────────── */

export async function fetchTripData(request: TripRequest, household: Household): Promise<PreparedData> {
  const dest = destinationById(request.destinationId);
  if (!dest) throw new Error(`Unknown destination: ${request.destinationId}`);
  const preferred = request.cabin ?? household.preferences.cabin;
  const cabins: Cabin[] = (["economy", "premium_economy", "business", "first"] as Cabin[]).filter(
    (c) => CABIN_RANK[c] <= Math.max(CABIN_RANK[preferred] + 1, CABIN_RANK.business),
  );
  const flightProvider = getFlightProvider();
  const hotelProvider = getHotelProvider();
  const expProvider = getExperienceProvider();
  const [flights, hotels, experiences] = await Promise.all([
    flightProvider.searchFlights({
      origin: request.origin,
      destinationAirports: dest.airports,
      departDate: request.departDate,
      returnDate: request.returnDate,
      adults: request.adults,
      children: request.children,
      cabins,
      flexibleDays: request.flexibleDays,
      destinationId: dest.id,
    } as Parameters<typeof flightProvider.searchFlights>[0]),
    hotelProvider.searchHotels({
      destinationId: dest.id,
      checkIn: request.departDate,
      checkOut: request.returnDate,
      guests: request.adults + request.children,
    }),
    expProvider.searchExperiences({ destinationId: dest.id, styles: request.styles ?? household.preferences.styles }),
  ]);
  const maxStops = household.preferences.maxStops;
  const stopFilter = (o: FlightOffer) => o.stops <= Math.max(maxStops, 1);
  return {
    outbound: flights.outbound.filter(stopFilter),
    ret: flights.return.filter(stopFilter),
    hotels,
    experiences,
    dateInsights: flights.dateInsights,
    providers: [flightProvider.info().name, hotelProvider.info().name, expProvider.info().name],
    warnings: flights.warnings,
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
  if (strategy === "luxury" && o.slot !== "hotel" && o.cabin && CABIN_RANK[o.cabin] < Math.min(CABIN_RANK[preferredCabin], CABIN_RANK.business)) {
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
): ComboEval {
  const draws = [...combo.outbound.draws, ...combo.return.draws, ...combo.hotel.draws];
  const feasible = draws.length === 0 || balances.allocate(draws).feasible;
  const ledger = base.clone();
  const credits = new Map<ComponentSlot, AppliedCredit[]>();
  let cash = 0;
  let score = 0;
  // Apply hotel first so program-specific credits (FHR/Edit) are matched before generic travel credits.
  for (const slot of ["hotel", "outbound", "return"] as ComponentSlot[]) {
    const o = combo[slot];
    const applied = o.creditContext && o.cashCents > 0 ? toApplied(rules, ledger.apply(o.creditContext, { cardId: o.creditCardId })) : [];
    credits.set(slot, applied);
    const c = applied.reduce((a, x) => a + x.cents, 0);
    cash += o.cashCents - c;
    score += standaloneScore(strategy, o, household, c);
  }
  if (strategy === "luxury" && budget > 0 && cash > budget) score += (cash - budget) * 5;
  return { score, cash, credits, ledger, feasible };
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

function describeChoice(slot: ComponentSlot, chosen: PaymentOption, all: PaymentOption[], household: Household, rules: RulesRepository): string {
  const what = slot === "hotel" ? "hotel" : `${slot} flight`;
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

function buildPlan(
  strategy: StrategyId,
  combo: Record<ComponentSlot, PaymentOption>,
  ev: ComboEval,
  allOptions: Record<ComponentSlot, PaymentOption[]>,
  ctx: OptionContext & { request: TripRequest; experiences: ExperienceOffer[]; balances: HouseholdBalances; budget: number },
): Plan {
  const { rules, household } = ctx;
  const components = {} as Record<ComponentSlot, PlanComponent>;
  for (const slot of ["outbound", "return", "hotel"] as ComponentSlot[]) {
    const credits = ev.credits.get(slot) ?? [];
    const o = combo[slot];
    components[slot] = { option: o, credits, cashAfterCreditsCents: o.cashCents - credits.reduce((a, c) => a + c.cents, 0) };
  }
  const experiences = planExperiences(strategy, ctx.experiences, household, ctx.request, ctx.nights, ctx.party, ev.ledger, rules, ctx.bookingDate);

  const options = Object.values(combo);
  const draws = options.flatMap((o) => o.draws);
  const alloc = ctx.balances.allocate(draws);
  const pointsByProgram: Record<string, number> = {};
  for (const d of draws) pointsByProgram[d.programId] = (pointsByProgram[d.programId] ?? 0) + d.points;

  const bookingCredits = Object.values(components).flatMap((c) => c.credits);
  const expCredits = experiences.flatMap((e) => e.credits);
  const creditsCents = [...bookingCredits, ...expCredits].reduce((a, c) => a + c.cents, 0);
  const retailCents = options.reduce((a, o) => a + o.retailCents, 0) + experiences.reduce((a, e) => a + e.totalCents, 0);
  const cashCents =
    Object.values(components).reduce((a, c) => a + c.cashAfterCreditsCents, 0) +
    experiences.reduce((a, e) => a + e.cashAfterCreditsCents, 0);
  const perksValueCents = options.reduce((a, o) => a + o.perksValueCents, 0);
  const pointsValue = Math.round(draws.reduce((a, d) => a + d.points * valuation(household, d.programId), 0));

  // Balances before/after
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
  for (const slot of ["outbound", "return", "hotel"] as ComponentSlot[]) {
    const o = combo[slot];
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
      forSlot: slot,
    });
  }

  // Benefits unlocked
  const benefits: UnlockedBenefit[] = [];
  for (const c of [...bookingCredits, ...expCredits]) {
    benefits.push({ benefitId: c.benefitId, name: c.name, cardId: c.cardId, valueCents: c.cents, kind: "credit", guaranteed: true, note: `Uses ${formatUSD(c.cents)} of this period's credit (period ends ${c.periodEnd}).` });
  }
  for (const p of combo.hotel.perks) {
    if (!p.benefitId) continue;
    benefits.push({ benefitId: p.benefitId, name: p.name, cardId: rules.benefit(p.benefitId)?.cardId ?? "", valueCents: p.counted ? p.valueCents : undefined, kind: "perk", guaranteed: p.kind === "guaranteed", note: p.kind === "guaranteed" ? "Guaranteed program benefit" : "Subject to availability — not counted in value" });
  }
  const owned = new Set(household.travelers.flatMap((t) => t.cards.map((c) => c.cardId)));
  for (const lounge of rules.benefits().filter((b) => b.category === "lounge" && owned.has(b.cardId))) {
    benefits.push({ benefitId: lounge.id, name: lounge.name, cardId: lounge.cardId, kind: "access", guaranteed: false, note: "Eligibility depends on airport, airline and guest policy." });
  }
  const flightPaidWith = new Set([combo.outbound, combo.return].map((o) => o.payWithCardId ?? o.earn?.cardId ?? (o.bankProgramId === "chase-ur" ? "chase-sapphire-reserve" : o.bankProgramId === "amex-mr" ? "amex-platinum" : undefined)));
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

  const rationale = (["outbound", "return", "hotel"] as ComponentSlot[]).map((s) => describeChoice(s, combo[s], allOptions[s], household, rules));
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
  };
}

/* ───────────────────────────── Public API ───────────────────────────── */

export function optimizeWithData(input: OptimizeInput, data: PreparedData): OptimizationResult {
  const { request, household, rules, usage } = input;
  const dest = destinationById(request.destinationId)!;
  const bookingDate = input.bookingDate ?? rules.asOf;
  const nights = Math.max(1, daysBetween(request.departDate, request.returnDate));
  const party = Math.max(1, request.adults + request.children);
  const rooms = Math.max(1, Math.ceil(party / 2));
  const ctx: OptionContext = { rules, household, party, rooms, nights, bookingDate };
  const balances = householdBalances(household, rules);
  const preferredCabin = request.cabin ?? household.preferences.cabin;
  const budget = request.budgetCents ?? household.cashBudgetCents ?? 0;

  const allOptions: Record<ComponentSlot, PaymentOption[]> = {
    outbound: data.outbound.flatMap((f) => flightOptions(f, ctx)),
    return: data.ret.flatMap((f) => flightOptions(f, ctx)),
    hotel: data.hotels.flatMap((h) => hotelOptions(h, ctx)),
  };
  if (!allOptions.outbound.length || !allOptions.return.length || !allOptions.hotel.length) {
    throw new Error("No bookable options were found for this trip.");
  }

  const ledger = new CreditLedger(rules.benefits({ date: bookingDate }), household, usage);
  const plans = {} as Record<StrategyId, Plan>;

  for (const strategy of ["savings", "balanced", "luxury"] as StrategyId[]) {
    let best: { combo: Record<ComponentSlot, PaymentOption>; ev: ComboEval } | null = null;
    const search = (relaxed: boolean) => {
      const k = 10;
      const pick = (slot: ComponentSlot) => {
        const p = prune(strategy, allOptions[slot], household, preferredCabin, k);
        return p.length || !relaxed ? p : prune("balanced", allOptions[slot], household, preferredCabin, k);
      };
      const outs = pick("outbound");
      const rets = pick("return");
      const hotels = pick("hotel");
      for (const o of outs) for (const r of rets) for (const h of hotels) {
        const combo = { outbound: o, return: r, hotel: h };
        const ev = evaluateCombo(strategy, combo, ledger, balances, household, rules, budget);
        if (!ev.feasible) continue;
        if (!best || ev.score < best.ev.score) best = { combo, ev };
      }
    };
    search(false);
    if (!best) search(true);
    if (!best) {
      // Last resort: cheapest cash everywhere.
      const cheapest = (slot: ComponentSlot) => allOptions[slot].filter((o) => o.method === "cash").sort((a, b) => a.cashCents - b.cashCents)[0]!;
      const combo = { outbound: cheapest("outbound"), return: cheapest("return"), hotel: cheapest("hotel") };
      best = { combo, ev: evaluateCombo(strategy, combo, ledger, balances, household, rules, budget) };
    }
    const chosen = best as { combo: Record<ComponentSlot, PaymentOption>; ev: ComboEval };
    plans[strategy] = buildPlan(strategy, chosen.combo, chosen.ev, allOptions, {
      ...ctx,
      request,
      experiences: data.experiences,
      balances,
      budget,
    });
  }

  // Keep stored results compact: best few options per offer.
  const compact = (opts: PaymentOption[], chosenIds: Set<string>) => {
    const byOffer = new Map<string, PaymentOption[]>();
    for (const o of opts) byOffer.set(o.offerId, [...(byOffer.get(o.offerId) ?? []), o]);
    const out: PaymentOption[] = [];
    for (const list of byOffer.values()) {
      const ranked = list
        .map((o) => ({ o, s: standaloneScore("balanced", o, household, 0) }))
        .sort((a, b) => a.s - b.s)
        .map((x) => x.o);
      const keep = new Set([...ranked.slice(0, 3), ...list.filter((o) => o.method === "cash" || chosenIds.has(o.id))]);
      out.push(...keep);
    }
    return out;
  };
  const chosenIds = new Set(Object.values(plans).flatMap((p) => Object.values(p.components).map((c) => c.option.id)));

  return {
    id: globalThis.crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    request,
    destination: dest,
    nights,
    party,
    rooms,
    plans,
    recommended: "balanced",
    flights: { outbound: data.outbound, return: data.ret },
    hotels: data.hotels,
    experiences: data.experiences,
    options: {
      outbound: compact(allOptions.outbound, chosenIds),
      return: compact(allOptions.return, chosenIds),
      hotel: compact(allOptions.hotel, chosenIds),
    },
    dateInsights: data.dateInsights,
    dataNotice:
      data.outbound.some((f) => f.dataKind === "live")
        ? "Flight cash fares are live quotes from a connected provider and may change or expire; hotel rates, experiences and any award pricing are demonstration estimates. Verify every booking on the official site before transferring points."
        : "Demonstration data: fares, award prices and hotel rates are illustrative estimates generated by PerkPilot's demo model — not live quotes. Award availability is never confirmed. Verify every booking on the official site before transferring points.",
    rulesVersion: rules.dataset.version,
    providers: data.providers,
    warnings: data.warnings,
  };
}

export async function optimizeTrip(input: OptimizeInput): Promise<OptimizationResult> {
  const data = await fetchTripData(input.request, input.household);
  return optimizeWithData(input, data);
}
