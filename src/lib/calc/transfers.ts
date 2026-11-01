import type { TransferBonus, TransferPartner } from "@/lib/domain/types";

export interface TransferQuote {
  partnerId: string;
  fromProgram: string;
  toProgram: string;
  /** Partner points the booking needs. */
  partnerPointsNeeded: number;
  /** Source (bank) points to transfer, rounded up to the partner increment. */
  sourcePoints: number;
  /** Partner points that will actually land (may exceed need due to increments). */
  partnerPointsReceived: number;
  /** Partner points received per 1 source point, including bonus. */
  effectiveRatio: number;
  bonusPercent: number;
  bonusId?: string;
}

/** Partner points per source point, including any bonus. */
export function effectiveRatio(partner: TransferPartner, bonus?: TransferBonus): number {
  const base = partner.ratioTo / partner.ratioFrom;
  return base * (1 + (bonus?.bonusPercent ?? 0) / 100);
}

/** Partner points received for a given number of source points. */
export function partnerPointsFor(sourcePoints: number, partner: TransferPartner, bonus?: TransferBonus): number {
  const blocks = Math.floor(sourcePoints / partner.ratioFrom);
  const base = blocks * partner.ratioTo;
  const bonusPts = Math.floor(base * ((bonus?.bonusPercent ?? 0) / 100));
  return base + bonusPts;
}

/**
 * Minimum source points that must be transferred to cover `partnerPointsNeeded`,
 * respecting the transfer increment and minimum.
 */
export function quoteTransfer(
  partnerPointsNeeded: number,
  partner: TransferPartner,
  bonus?: TransferBonus,
): TransferQuote {
  const need = Math.max(0, Math.ceil(partnerPointsNeeded));
  const ratio = effectiveRatio(partner, bonus);
  let source = 0;
  if (need > 0) {
    // Start from the analytical estimate then walk up by increments to be exact.
    const step = Math.max(partner.increment, partner.ratioFrom);
    source = Math.max(partner.minimumTransfer, Math.ceil(need / ratio / step) * step);
    while (partnerPointsFor(source, partner, bonus) < need) source += step;
    // Walk down if the estimate overshot by a full step.
    while (
      source - step >= partner.minimumTransfer &&
      partnerPointsFor(source - step, partner, bonus) >= need
    ) {
      source -= step;
    }
  }
  return {
    partnerId: partner.id,
    fromProgram: partner.fromProgram,
    toProgram: partner.toProgram,
    partnerPointsNeeded: need,
    sourcePoints: source,
    partnerPointsReceived: partnerPointsFor(source, partner, bonus),
    effectiveRatio: ratio,
    bonusPercent: bonus?.bonusPercent ?? 0,
    bonusId: bonus?.id,
  };
}
