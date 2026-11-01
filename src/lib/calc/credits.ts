import type { Benefit, BenefitUsage, BookingChannel, ComponentKind, Household } from "@/lib/domain/types";
import { isEffective } from "@/lib/rules/repository";
import { periodFor } from "./periods";

export interface CreditContext {
  /** Charge date — credits are tied to when the card is charged. */
  chargeDate: string;
  component: ComponentKind;
  channel: BookingChannel;
  tags: string[];
  /** Eligible spend on the card for this purchase, in cents. */
  spendCents: number;
  nights?: number;
  prepaid?: boolean;
}

export interface CreditEvaluation {
  benefitId: string;
  usableCents: number;
  periodKey: string;
  periodEnd: string;
  reason?: string;
}

const CHANNEL_FAMILY: Partial<Record<BookingChannel, BookingChannel>> = {
  amex_fhr: "amex_travel",
  amex_thc: "amex_travel",
  chase_edit: "chase_travel",
};

export function channelMatches(required: BookingChannel | undefined, actual: BookingChannel): boolean {
  if (!required || required === "any") return true;
  return actual === required || CHANNEL_FAMILY[actual] === required;
}

/**
 * Realistically usable value of a single credit for a single purchase, given
 * what has already been used this period and whether the user enrolled.
 * Returns 0 with a human-readable reason whenever the credit does not apply.
 */
export function evaluateCredit(
  benefit: Benefit,
  ctx: CreditContext,
  state: { usedCents: number; enrolled: boolean; anniversary?: string },
): CreditEvaluation {
  const period = periodFor(benefit.period, ctx.chargeDate, state.anniversary);
  const base = { benefitId: benefit.id, periodKey: period.key, periodEnd: period.end };
  const no = (reason: string): CreditEvaluation => ({ ...base, usableCents: 0, reason });

  if (!benefit.amountCents) return no("Not a statement credit");
  if (!isEffective(benefit, ctx.chargeDate)) return no("Not in effect on the charge date");
  if (!benefit.appliesTo.includes(ctx.component)) return no(`Does not apply to ${ctx.component}`);
  if (!channelMatches(benefit.bookingChannel, ctx.channel)) return no(`Requires booking via ${benefit.bookingChannel}`);
  if (benefit.eligibleTags?.length && !benefit.eligibleTags.some((t) => ctx.tags.includes(t))) {
    return no(`Merchant/booking not eligible (${benefit.eligibleTags.join(", ")})`);
  }
  if (benefit.minNights && (ctx.nights ?? 0) < benefit.minNights) return no(`Requires ${benefit.minNights}+ nights`);
  if (benefit.prepaidRequired && !ctx.prepaid) return no("Requires a prepaid booking");
  if (benefit.enrollmentRequired && !state.enrolled) return no("Enrollment/activation not confirmed");
  const remaining = Math.max(0, benefit.amountCents - state.usedCents);
  if (remaining === 0) return no("Already used this period");
  return { ...base, usableCents: Math.min(remaining, Math.max(0, ctx.spendCents)) };
}

/**
 * Tracks credit consumption across all components in a plan so a credit is
 * never double counted (e.g. the same $300 hotel credit across two hotels).
 */
export class CreditLedger {
  private used = new Map<string, number>();

  constructor(
    private readonly benefits: Benefit[],
    private readonly household: Household,
    private readonly usage: BenefitUsage[],
  ) {}

  clone(): CreditLedger {
    const c = new CreditLedger(this.benefits, this.household, this.usage);
    c.used = new Map(this.used);
    return c;
  }

  /** Travelers who hold the card as a primary cardmember (or AU if allowed). */
  holders(benefit: Benefit): string[] {
    return this.household.travelers
      .filter((t) =>
        t.cards.some(
          (c) => c.cardId === benefit.cardId && (c.role === "primary" || benefit.appliesToAuthorizedUsers),
        ),
      )
      .map((t) => t.id);
  }

  private anniversaryFor(travelerId: string, cardId: string): string | undefined {
    const t = this.household.travelers.find((x) => x.id === travelerId);
    return t?.cards.find((c) => c.cardId === cardId)?.openedDate?.slice(5);
  }

  private recordedUsage(benefitId: string, travelerId: string, periodKey: string) {
    return this.usage.find((u) => u.benefitId === benefitId && u.travelerId === travelerId && u.periodKey === periodKey);
  }

  isEnrolled(benefitId: string, travelerId: string): boolean {
    return this.usage.some((u) => u.benefitId === benefitId && u.travelerId === travelerId && u.enrolled);
  }

  /** Evaluate (without consuming) the best holder's usable value. */
  peek(benefit: Benefit, ctx: CreditContext): CreditEvaluation & { travelerId?: string } {
    let best: (CreditEvaluation & { travelerId?: string }) | null = null;
    for (const travelerId of this.holders(benefit)) {
      const anniversary = this.anniversaryFor(travelerId, benefit.cardId);
      const period = periodFor(benefit.period, ctx.chargeDate, anniversary);
      const rec = this.recordedUsage(benefit.id, travelerId, period.key);
      const key = `${benefit.id}|${travelerId}|${period.key}`;
      const usedCents = (rec?.usedCents ?? 0) + (this.used.get(key) ?? 0);
      const enrolled = !benefit.enrollmentRequired || this.isEnrolled(benefit.id, travelerId);
      const ev = { ...evaluateCredit(benefit, ctx, { usedCents, enrolled, anniversary }), travelerId };
      if (!best || ev.usableCents > best.usableCents) best = ev;
    }
    return best ?? { benefitId: benefit.id, usableCents: 0, periodKey: "", periodEnd: "", reason: "No household member holds this card" };
  }

  /** Apply the best credits to a purchase, consuming them. Returns applied credits. */
  apply(ctx: CreditContext, opts: { cardId?: string } = {}): Array<CreditEvaluation & { travelerId: string }> {
    const applied: Array<CreditEvaluation & { travelerId: string }> = [];
    let spendLeft = ctx.spendCents;
    const candidates = this.benefits.filter(
      (b) => b.amountCents && b.appliesTo.includes(ctx.component) && (!opts.cardId || b.cardId === opts.cardId),
    );
    for (const b of candidates) {
      if (spendLeft <= 0) break;
      const ev = this.peek(b, { ...ctx, spendCents: spendLeft });
      if (ev.usableCents > 0 && ev.travelerId) {
        const key = `${b.id}|${ev.travelerId}|${ev.periodKey}`;
        this.used.set(key, (this.used.get(key) ?? 0) + ev.usableCents);
        spendLeft -= ev.usableCents;
        applied.push({ ...ev, travelerId: ev.travelerId });
      }
    }
    return applied;
  }
}
