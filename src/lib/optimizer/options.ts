import type { Benefit, FlightOffer, HotelOffer, Household, VerificationStatus } from "@/lib/domain/types";
import { centsPerPoint } from "@/lib/calc/cpp";
import { scoreConfidence } from "@/lib/calc/confidence";
import { bestCardForSpend } from "@/lib/calc/earn";
import { formatPoints } from "@/lib/calc/money";
import { quoteTransfer } from "@/lib/calc/transfers";
import type { RulesRepository } from "@/lib/rules/repository";
import { householdBalances } from "./balances";
import type { PaymentOption, PerkValue, PointsDraw } from "./types";

export interface OptionContext {
  rules: RulesRepository;
  household: Household;
  party: number;
  rooms: number;
  nights: number;
  /** Date the booking would be charged (today) — drives credit periods & bonuses. */
  bookingDate: string;
}

const statusOf = (rules: RulesRepository, ids: string[]): VerificationStatus[] =>
  ids.map(
    (id) =>
      rules.benefit(id)?.verification ??
      rules.dataset.transferPartners.find((t) => t.id === id)?.verification ??
      rules.dataset.transferBonuses.find((t) => t.id === id)?.verification ??
      rules.dataset.portalRates.find((t) => t.id === id)?.verification ??
      "unverified",
  );

function ownsCard(h: Household, cardId: string): boolean {
  return h.travelers.some((t) => t.cards.some((c) => c.cardId === cardId));
}

function cardOpenedDate(h: Household, cardId: string): string | undefined {
  return h.travelers.flatMap((t) => t.cards).find((c) => c.cardId === cardId && c.role === "primary")?.openedDate;
}

/* ───────────────────────────── Flights ───────────────────────────── */

function flightQuality(o: FlightOffer, ctx: OptionContext): number {
  const c = ctx.household.preferences.comfort;
  const hours = o.durationMin / 60;
  const cabinPerHour =
    o.cabin === "premium_economy" ? c.premiumEconomyPerHourCents
    : o.cabin === "business" ? c.businessPerHourCents
    : o.cabin === "first" ? c.firstPerHourCents
    : 0;
  return Math.round(
    ctx.party * (cabinPerHour * hours - c.stopPenaltyCents * o.stops - c.hourPenaltyCents * hours),
  );
}

export function flightOptions(offer: FlightOffer, ctx: OptionContext): PaymentOption[] {
  const { rules, household, party } = ctx;
  const slot = offer.direction;
  const retail = offer.cashPerPersonCents * party;
  const quality = flightQuality(offer, ctx);
  const opts: PaymentOption[] = [];
  const balances = householdBalances(household, rules);
  const conf = (ids: string[], availability?: "unknown" | "estimated" | "confirmed") =>
    scoreConfidence({ dataKind: offer.dataKind, ruleStatuses: statusOf(rules, ids), availability });
  const flex = offer.refundable ? "refundable" : "nonrefundable";
  const route = `${offer.origin}→${offer.destination}`;

  // 1. Cash, booked direct
  const earn = bestCardForSpend(rules, household, "flights_direct", retail);
  opts.push({
    id: `${offer.id}|cash`,
    slot,
    offerId: offer.id,
    method: "cash",
    label: `Pay cash with ${earn ? rules.card(earn.cardId)?.name.split("®")[0] : "card"}`,
    channel: "direct",
    payWithCardId: earn?.cardId,
    draws: [],
    cashCents: retail,
    retailCents: retail,
    awardTaxesCents: 0,
    awardOnlyChargesCents: 0,
    cpp: null,
    creditContext: { chargeDate: ctx.bookingDate, component: "flight", channel: "direct", tags: ["travel"], spendCents: retail },
    perks: [],
    perksValueCents: 0,
    qualityCents: quality,
    flexibility: flex,
    cabin: offer.cabin,
    steps: [
      `Book ${offer.carrierName} ${offer.flightNumbers.join(" / ")} (${route}) directly with the airline.`,
      earn ? `Pay with your ${rules.card(earn.cardId)?.name} (${earn.multiplier}x — about ${formatPoints(earn.pointsEarned)} ${rules.programName(earn.programId)} points).` : "Pay with your preferred travel card.",
    ],
    warnings: [],
    bookingUrl: offer.bookingUrl,
    ruleRefs: [],
    confidence: conf([]),
    earn,
  });

  // 2. Portal redemptions
  for (const card of rules.cards) {
    if (!ownsCard(household, card.id)) continue;
    const rate = rules.portalRate(card.id, "flight", cardOpenedDate(household, card.id));
    if (!rate) continue;
    const pts = Math.ceil(retail / rate.centsPerPoint);
    if (balances.maxAccessible(card.programId) < pts) continue;
    opts.push({
      id: `${offer.id}|portal|${card.id}`,
      slot,
      offerId: offer.id,
      method: "portal_points",
      label: `${rate.channel === "chase_travel" ? "Chase Travel" : "Amex Travel"} with points`,
      channel: rate.channel,
      bankProgramId: card.programId,
      draws: [{ programId: card.programId, points: pts }],
      cashCents: 0,
      retailCents: retail,
      awardTaxesCents: 0,
      awardOnlyChargesCents: 0,
      cpp: rate.centsPerPoint,
      perks: [],
      perksValueCents: 0,
      qualityCents: quality,
      flexibility: flex,
      cabin: offer.cabin,
      steps: [
        `Search ${route} on ${rate.channel === "chase_travel" ? "Chase Travel" : "Amex Travel"} for ${offer.date}.`,
        `Confirm the portal price matches about ${(retail / 100).toFixed(0)} USD, then pay with ${formatPoints(pts)} ${rules.programName(card.programId)} points (${rate.centsPerPoint}¢ each).`,
        rate.channel === "chase_travel" ? "If Chase shows a Points Boost rate for this flight, you may need fewer points." : "Portal fares earn airline miles like a paid ticket.",
      ],
      warnings: ["Portal prices can differ from airline prices — verify before booking."],
      bookingUrl: rate.channel === "chase_travel" ? "https://www.chase.com/travel" : "https://www.americanexpress.com/en-us/travel/",
      ruleRefs: [rate.id],
      confidence: conf([rate.id]),
    });
  }

  // 3. Awards — direct loyalty balance or transfer from a bank program
  for (const award of offer.awards) {
    const program = rules.program(award.programId);
    if (!program) continue;
    const partnerTotal = award.pointsPerPerson * party;
    const taxes = award.taxesPerPersonCents * party;
    const extra = award.awardOnlyChargesPerPersonCents * party;
    const cashEarn = bestCardForSpend(rules, household, "flights_direct", taxes + extra);
    const awardSteps = (draw: string): string[] => [
      `Search ${program.shortName} award space for ${route} on ${offer.date} in ${offer.cabin.replace("_", " ")} — confirm ${party} seat(s) are bookable at about ${formatPoints(award.pointsPerPerson)} ${program.currency}/person.`,
      draw,
      `Book on ${program.name} for all ${party} traveler(s); pay ${((taxes + extra) / 100).toFixed(2)} USD taxes/fees with ${cashEarn ? rules.card(cashEarn.cardId)?.name : "your card"}.`,
    ];
    const warnings = [
      "Award availability is estimated — confirm seats before transferring points.",
      ...(extra > 0 ? [`Includes about ${(extra / 100).toFixed(0)} USD of carrier-imposed surcharges.`] : []),
    ];
    // Direct balance (with optional top-up later)
    const direct = balances.maxAccessible(program.id);
    if (direct >= partnerTotal) {
      opts.push({
        id: `${offer.id}|direct|${program.id}`,
        slot,
        offerId: offer.id,
        method: "direct_award",
        label: `${program.shortName} miles you already hold`,
        channel: "direct",
        loyaltyProgramId: program.id,
        draws: [{ programId: program.id, points: partnerTotal }],
        partnerPoints: partnerTotal,
        cashCents: taxes + extra,
        retailCents: retail,
        awardTaxesCents: taxes,
        awardOnlyChargesCents: extra,
        cpp: centsPerPoint({ comparableCashCents: retail, awardTaxesCents: taxes, awardOnlyChargesCents: extra, points: partnerTotal }),
        perks: [],
        perksValueCents: 0,
        qualityCents: quality,
        flexibility: "changeable",
        cabin: offer.cabin,
        steps: awardSteps(`Use ${formatPoints(partnerTotal)} ${program.shortName} ${program.currency} from your existing balance — no transfer needed.`),
        warnings,
        bookingUrl: program.awardSearchUrl ?? offer.bookingUrl,
        verifyUrl: award.verifyUrl,
        ruleRefs: [program.id],
        confidence: conf([], award.availability),
        earn: cashEarn,
      });
    }
    for (const partner of rules.transferPathsTo(program.id)) {
      if (balances.total(partner.fromProgram) <= 0) continue;
      const topUp = direct > 0 && direct < partnerTotal ? direct : 0;
      const bonus = rules.activeBonus(partner.fromProgram, program.id, ctx.bookingDate);
      const quote = quoteTransfer(partnerTotal - topUp, partner, bonus);
      if (balances.maxAccessible(partner.fromProgram) < quote.sourcePoints) continue;
      const draws: PointsDraw[] = [{ programId: partner.fromProgram, points: quote.sourcePoints }];
      if (topUp) draws.push({ programId: program.id, points: topUp });
      const bankName = rules.programName(partner.fromProgram);
      opts.push({
        id: `${offer.id}|xfer|${partner.fromProgram}|${program.id}`,
        slot,
        offerId: offer.id,
        method: "transfer_award",
        label: `${bankName} → ${program.shortName}`,
        channel: "direct",
        bankProgramId: partner.fromProgram,
        loyaltyProgramId: program.id,
        transfer: quote,
        draws,
        partnerPoints: partnerTotal,
        cashCents: taxes + extra,
        retailCents: retail,
        awardTaxesCents: taxes,
        awardOnlyChargesCents: extra,
        cpp: centsPerPoint({
          comparableCashCents: retail,
          awardTaxesCents: taxes,
          awardOnlyChargesCents: extra,
          points: quote.sourcePoints + topUp,
        }),
        perks: [],
        perksValueCents: 0,
        qualityCents: quality,
        flexibility: "changeable",
        cabin: offer.cabin,
        steps: awardSteps(
          `Transfer ${formatPoints(quote.sourcePoints)} ${bankName} → ${formatPoints(quote.partnerPointsReceived)} ${program.shortName} (${partner.ratioFrom}:${partner.ratioTo}${quote.bonusPercent ? ` + ${quote.bonusPercent}% bonus` : ""}; ${partner.transferTime.toLowerCase()})${topUp ? `, combined with ${formatPoints(topUp)} you already hold` : ""}. Transfers are irreversible.`,
        ),
        warnings: [...warnings, ...(bonus?.verification === "demo" ? ["Transfer bonus shown is a demo promotion."] : [])],
        bookingUrl: program.awardSearchUrl ?? offer.bookingUrl,
        verifyUrl: award.verifyUrl,
        ruleRefs: [partner.id, ...(bonus ? [bonus.id] : [])],
        confidence: conf([partner.id, ...(bonus ? [bonus.id] : [])], award.availability),
        earn: cashEarn,
      });
    }
  }
  return opts;
}

/* ───────────────────────────── Hotels ───────────────────────────── */

function hotelCashTotal(h: HotelOffer, nights: number, rooms: number): { total: number; resort: number } {
  const room = h.nightlyCashCents * nights * rooms;
  const resort = h.resortFeePerNightCents * nights * rooms;
  return { total: Math.round(room * (1 + h.taxesPct)) + resort, resort };
}

function hotelQuality(h: HotelOffer, ctx: OptionContext): number {
  const lux = h.tier === "luxury" ? ctx.household.preferences.comfort.luxuryHotelPerNightCents : 0;
  return Math.round((lux + (h.rating - 4.5) * 4000) * ctx.nights);
}

function programPerks(benefit: Benefit | undefined, h: HotelOffer, ctx: OptionContext): PerkValue[] {
  if (!benefit?.perks) return [];
  const guests = Math.min(ctx.party, 2 * ctx.rooms);
  return benefit.perks.map((p) => {
    let value = 0;
    let counted = false;
    if (p.kind === "guaranteed" && p.valuation) {
      if (p.valuation.type === "breakfast_per_night") {
        // Avoid double counting: breakfast has no added value when the cash rate already includes it.
        if (!h.includesBreakfast) {
          value = Math.round(p.valuation.perPersonCents * guests * ctx.nights);
          counted = value > 0;
        }
      } else if (p.valuation.type === "fixed_per_stay") {
        value = Math.round(p.valuation.cents * ctx.rooms * (p.usefulness ?? 1));
        counted = value > 0;
      }
    }
    return { name: p.name, kind: p.kind, valueCents: value, counted, benefitId: benefit.id };
  });
}

export function hotelOptions(h: HotelOffer, ctx: OptionContext): PaymentOption[] {
  const { rules, household, nights, rooms } = ctx;
  const { total: retail, resort } = hotelCashTotal(h, nights, rooms);
  const quality = hotelQuality(h, ctx);
  const balances = householdBalances(household, rules);
  const flex = h.refundable ? "refundable" : "nonrefundable";
  const opts: PaymentOption[] = [];
  const conf = (ids: string[], availability?: "unknown" | "estimated" | "confirmed") =>
    scoreConfidence({ dataKind: h.dataKind, ruleStatuses: statusOf(rules, ids), availability });
  const stay = `${nights} night${nights === 1 ? "" : "s"} × ${rooms} room${rooms === 1 ? "" : "s"}`;

  const base = {
    slot: "hotel" as const,
    offerId: h.id,
    retailCents: retail,
    awardTaxesCents: 0,
    awardOnlyChargesCents: 0,
    qualityCents: quality,
    tier: h.tier,
    bookingUrl: h.bookingUrl,
  };

  // 1. Cash direct
  const earnDirect = bestCardForSpend(rules, household, "hotels_direct", retail);
  opts.push({
    ...base,
    id: `${h.id}|cash`,
    method: "cash",
    label: "Book direct, pay cash",
    channel: "direct",
    payWithCardId: earnDirect?.cardId,
    draws: [],
    cashCents: retail,
    cpp: null,
    creditContext: { chargeDate: ctx.bookingDate, component: "hotel", channel: "direct", tags: ["travel", ...h.tags.filter((t) => !["fhr", "thc", "the_edit"].includes(t))], spendCents: retail, nights, prepaid: !h.refundable },
    perks: h.chainProgramId ? [{ name: `${rules.programName(h.chainProgramId)} points & elite benefits on paid stays`, kind: "when_available", valueCents: 0, counted: false }] : [],
    perksValueCents: 0,
    flexibility: flex,
    steps: [`Book ${h.name} directly for ${stay}.`, earnDirect ? `Pay with ${rules.card(earnDirect.cardId)?.name} (${earnDirect.multiplier}x).` : "Pay with your travel card."],
    warnings: resort ? [`Includes ${(resort / 100).toFixed(0)} USD in resort fees.`] : [],
    ruleRefs: [],
    confidence: conf([]),
    earn: earnDirect,
  });

  // 2. Card hotel programs (FHR / THC / The Edit) — cash, prepaid via issuer travel
  const programDefs: Array<{ tag: "amex_fhr" | "amex_thc" | "chase_edit"; benefitId: string; cardId: string; channelTag: string; label: string; url: string }> = [
    { tag: "amex_fhr", benefitId: "amex-plat-fhr", cardId: "amex-platinum", channelTag: "fhr", label: "Amex Fine Hotels + Resorts", url: "https://www.americanexpress.com/en-us/travel/fine-hotels-resorts/" },
    { tag: "amex_thc", benefitId: "amex-plat-thc", cardId: "amex-platinum", channelTag: "thc", label: "Amex The Hotel Collection", url: "https://www.americanexpress.com/en-us/travel/the-hotel-collection/" },
    { tag: "chase_edit", benefitId: "csr-the-edit", cardId: "chase-sapphire-reserve", channelTag: "the_edit", label: "Chase The Edit", url: "https://www.chase.com/travel" },
  ];
  for (const def of programDefs) {
    if (!h.programs.includes(def.tag) || !ownsCard(household, def.cardId)) continue;
    const benefit = rules.benefit(def.benefitId);
    if (!benefit || !rules.benefits({ cardId: def.cardId }).some((b) => b.id === def.benefitId)) continue;
    if (benefit.minNights && nights < benefit.minNights) continue;
    // Program rates are modelled as matching the prepaid public rate (demo).
    const perks = programPerks(benefit, h, ctx);
    const perksValue = perks.filter((p) => p.counted).reduce((a, p) => a + p.valueCents, 0);
    const earn = bestCardForSpend(rules, { ...household, travelers: household.travelers.map((t) => ({ ...t, cards: t.cards.filter((c) => c.cardId === def.cardId) })) }, "portal_hotels", retail);
    opts.push({
      ...base,
      id: `${h.id}|prog|${def.tag}`,
      method: "program_booking",
      label: def.label,
      channel: def.tag,
      payWithCardId: def.cardId,
      creditCardId: def.cardId,
      draws: [],
      cashCents: retail,
      cpp: null,
      creditContext: { chargeDate: ctx.bookingDate, component: "hotel", channel: def.tag, tags: ["travel", def.channelTag, ...h.tags], spendCents: retail, nights, prepaid: true },
      perks,
      perksValueCents: perksValue,
      flexibility: "changeable",
      steps: [
        `Book ${h.name} through ${def.label} (${def.cardId === "amex-platinum" ? "Amex Travel" : "Chase Travel"}) as a prepaid rate for ${stay}.`,
        `Pay with your ${rules.card(def.cardId)?.name} — the cardmember must be on the reservation.`,
        "Perks are applied by the property at check-in; upgrades and early check-in depend on availability.",
      ],
      warnings: ["Program rate assumed equal to the public prepaid rate in demo mode — compare before booking.", ...(resort ? [`Resort fees of about ${(resort / 100).toFixed(0)} USD may still apply.`] : [])],
      bookingUrl: def.url,
      ruleRefs: [def.benefitId],
      confidence: conf([def.benefitId]),
      earn,
    });
  }

  // 3. Hotel awards — direct balance or transfer
  if (h.award) {
    const program = rules.program(h.award.programId);
    if (program) {
      const freeNights = ["marriott", "hilton"].includes(program.id) ? Math.floor(nights / 5) : 0;
      const partnerTotal = h.award.pointsPerNight * (nights - freeNights) * rooms;
      const waivesResort = program.id === "hyatt";
      const cashOnAward = waivesResort ? 0 : resort;
      const notes = [
        ...(freeNights ? [`Includes ${freeNights} free night(s) from the program's 5th-night benefit (verify eligibility).`] : []),
        ...(cashOnAward ? [`Resort fees of about ${(cashOnAward / 100).toFixed(0)} USD are usually still charged on award stays.`] : []),
      ];
      const direct = balances.maxAccessible(program.id);
      const awardSteps = (draw: string) => [
        `Check standard award availability at ${h.name} on ${program.name} for ${stay} (about ${formatPoints(h.award!.pointsPerNight)} pts/night).`,
        draw,
        "Book the award stay; award nights generally earn no points but may receive elite benefits.",
      ];
      if (direct >= partnerTotal) {
        opts.push({
          ...base,
          id: `${h.id}|direct|${program.id}`,
          method: "direct_award",
          label: `${program.shortName} points you hold`,
          channel: "direct",
          loyaltyProgramId: program.id,
          draws: [{ programId: program.id, points: partnerTotal }],
          partnerPoints: partnerTotal,
          cashCents: cashOnAward,
          awardTaxesCents: cashOnAward,
          cpp: centsPerPoint({ comparableCashCents: retail, awardTaxesCents: cashOnAward, points: partnerTotal }),
          perks: [],
          perksValueCents: 0,
          flexibility: "refundable",
          steps: awardSteps(`Redeem ${formatPoints(partnerTotal)} ${program.shortName} points you already hold.`),
          warnings: ["Award availability is estimated — confirm before booking.", ...notes],
          bookingUrl: program.awardSearchUrl ?? h.bookingUrl,
          ruleRefs: [],
          confidence: conf([], h.award.availability),
        });
      }
      for (const partner of rules.transferPathsTo(program.id)) {
        if (balances.total(partner.fromProgram) <= 0) continue;
        const topUp = direct > 0 && direct < partnerTotal ? direct : 0;
        const bonus = rules.activeBonus(partner.fromProgram, program.id, ctx.bookingDate);
        const quote = quoteTransfer(partnerTotal - topUp, partner, bonus);
        if (balances.maxAccessible(partner.fromProgram) < quote.sourcePoints) continue;
        const bankName = rules.programName(partner.fromProgram);
        const draws: PointsDraw[] = [{ programId: partner.fromProgram, points: quote.sourcePoints }];
        if (topUp) draws.push({ programId: program.id, points: topUp });
        opts.push({
          ...base,
          id: `${h.id}|xfer|${partner.fromProgram}|${program.id}`,
          method: "transfer_award",
          label: `${bankName} → ${program.shortName}`,
          channel: "direct",
          bankProgramId: partner.fromProgram,
          loyaltyProgramId: program.id,
          transfer: quote,
          draws,
          partnerPoints: partnerTotal,
          cashCents: cashOnAward,
          awardTaxesCents: cashOnAward,
          cpp: centsPerPoint({ comparableCashCents: retail, awardTaxesCents: cashOnAward, points: quote.sourcePoints + topUp }),
          perks: [],
          perksValueCents: 0,
          flexibility: "refundable",
          steps: awardSteps(
            `Transfer ${formatPoints(quote.sourcePoints)} ${bankName} → ${formatPoints(quote.partnerPointsReceived)} ${program.shortName} (${partner.ratioFrom}:${partner.ratioTo}${quote.bonusPercent ? ` + ${quote.bonusPercent}% bonus` : ""})${topUp ? `, plus ${formatPoints(topUp)} you already hold` : ""}. Transfers are irreversible.`,
          ),
          warnings: ["Award availability is estimated — confirm before transferring.", ...notes],
          bookingUrl: program.awardSearchUrl ?? h.bookingUrl,
          ruleRefs: [partner.id, ...(bonus ? [bonus.id] : [])],
          confidence: conf([partner.id, ...(bonus ? [bonus.id] : [])], h.award.availability),
        });
      }
    }
  }

  // 4. Portal points (Chase Travel / Amex Travel)
  for (const card of rules.cards) {
    if (!ownsCard(household, card.id)) continue;
    const rate = rules.portalRate(card.id, "hotel", cardOpenedDate(household, card.id));
    if (!rate) continue;
    const portalCash = retail - resort; // resort fees typically collected at the property
    const pts = Math.ceil(portalCash / rate.centsPerPoint);
    if (balances.maxAccessible(card.programId) < pts) continue;
    opts.push({
      ...base,
      id: `${h.id}|portal|${card.id}`,
      method: "portal_points",
      label: `${rate.channel === "chase_travel" ? "Chase Travel" : "Amex Travel"} with points`,
      channel: rate.channel,
      bankProgramId: card.programId,
      draws: [{ programId: card.programId, points: pts }],
      cashCents: resort,
      awardTaxesCents: resort,
      cpp: rate.centsPerPoint,
      perks: [],
      perksValueCents: 0,
      flexibility: flex,
      steps: [
        `Find ${h.name} on ${rate.channel === "chase_travel" ? "Chase Travel" : "Amex Travel"} for ${stay}.`,
        `Pay with ${formatPoints(pts)} ${rules.programName(card.programId)} points at ${rate.centsPerPoint}¢ each.`,
        "Portal bookings usually do not earn hotel points or elite benefits.",
      ],
      warnings: ["Portal prices can differ from the hotel's own site.", ...(resort ? ["Resort fees are typically paid at the property."] : [])],
      bookingUrl: rate.channel === "chase_travel" ? "https://www.chase.com/travel" : "https://www.americanexpress.com/en-us/travel/",
      ruleRefs: [rate.id],
      confidence: conf([rate.id]),
    });
  }

  return opts;
}

export function pointsLabel(o: PaymentOption, rules: RulesRepository): string {
  return o.draws.map((d) => `${formatPoints(d.points)} ${rules.programName(d.programId)}`).join(" + ");
}
