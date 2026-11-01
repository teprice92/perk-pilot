/**
 * Cents-per-point (CPP) redemption value.
 *
 * Spec formula (dollars):
 *   CPP = ((comparable cash cost − award taxes & fees − unavoidable award-only charges) / points) × 100
 *
 * All PerkPilot amounts are already in cents, so the ×100 is implicit:
 *   CPP = (cashCents − taxesCents − awardOnlyCents) / points
 */
export interface CppInput {
  /** Comparable cash price for the same itinerary/room, in cents. */
  comparableCashCents: number;
  /** Taxes & fees still payable on the award, in cents. */
  awardTaxesCents: number;
  /** Carrier surcharges, resort fees on awards, or other award-only charges, in cents. */
  awardOnlyChargesCents?: number;
  /** Points redeemed (in the currency actually spent — e.g. bank points after transfer). */
  points: number;
}

export function centsPerPoint(input: CppInput): number | null {
  const { comparableCashCents, awardTaxesCents, awardOnlyChargesCents = 0, points } = input;
  if (!Number.isFinite(points) || points <= 0) return null;
  const value = comparableCashCents - awardTaxesCents - awardOnlyChargesCents;
  return round4(value / points);
}

/** Same formula expressed in dollars — kept to document & test parity with the spec. */
export function centsPerPointFromDollars(cash: number, taxes: number, awardOnly: number, points: number): number | null {
  if (points <= 0) return null;
  return round4(((cash - taxes - awardOnly) / points) * 100);
}

/** Value in cents of `points` at a given valuation (cents per point). */
export function pointsValueCents(points: number, cpp: number): number {
  return Math.round(points * cpp);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
