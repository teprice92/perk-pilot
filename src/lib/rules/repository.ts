import type {
  Benefit,
  BenefitOverride,
  Card,
  Effective,
  PortalRate,
  RewardsProgram,
  RulesDataset,
  TransferBonus,
  TransferPartner,
} from "@/lib/domain/types";

export function isEffective(rule: Effective, date: string): boolean {
  if (rule.effectiveFrom > date) return false;
  if (rule.effectiveTo && rule.effectiveTo < date) return false;
  return true;
}

/**
 * Read-only, date-scoped view over a rules dataset. All engine code asks the
 * repository for rules "as of" a date, so historical/future rule changes are
 * honoured automatically and nothing is hardcoded in calculation logic.
 */
export class RulesRepository {
  readonly asOf: string;
  private readonly data: RulesDataset;
  private readonly programById: Map<string, RewardsProgram>;
  private readonly cardById: Map<string, Card>;

  constructor(data: RulesDataset, asOf: string, overrides: BenefitOverride[] = []) {
    this.asOf = asOf;
    const ov = new Map(overrides.map((o) => [o.benefitId, o]));
    this.data = {
      ...data,
      benefits: data.benefits
        .map((b) => applyOverride(b, ov.get(b.id)))
        .filter((b): b is Benefit => b !== null),
    };
    this.programById = new Map(data.programs.map((p) => [p.id, p]));
    this.cardById = new Map(data.cards.map((c) => [c.id, c]));
  }

  get dataset(): RulesDataset {
    return this.data;
  }

  program(id: string): RewardsProgram | undefined {
    return this.programById.get(id);
  }

  programName(id: string): string {
    return this.programById.get(id)?.shortName ?? id;
  }

  card(id: string): Card | undefined {
    return this.cardById.get(id);
  }

  get programs(): RewardsProgram[] {
    return this.data.programs;
  }

  get cards(): Card[] {
    return this.data.cards;
  }

  benefits(opts: { cardId?: string; date?: string } = {}): Benefit[] {
    const date = opts.date ?? this.asOf;
    return this.data.benefits.filter(
      (b) => isEffective(b, date) && (!opts.cardId || b.cardId === opts.cardId),
    );
  }

  /** All benefits regardless of date (for the history view). */
  allBenefits(): Benefit[] {
    return this.data.benefits;
  }

  benefit(id: string): Benefit | undefined {
    return this.data.benefits.find((b) => b.id === id);
  }

  transferPartners(fromProgram?: string, date = this.asOf): TransferPartner[] {
    return this.data.transferPartners.filter(
      (t) => isEffective(t, date) && (!fromProgram || t.fromProgram === fromProgram),
    );
  }

  /** Bank programs that can transfer into `toProgram`. */
  transferPathsTo(toProgram: string, date = this.asOf): TransferPartner[] {
    return this.data.transferPartners.filter((t) => t.toProgram === toProgram && isEffective(t, date));
  }

  activeBonus(fromProgram: string, toProgram: string, date = this.asOf): TransferBonus | undefined {
    return this.data.transferBonuses.find(
      (b) => b.fromProgram === fromProgram && b.toProgram === toProgram && b.startDate <= date && b.endDate >= date,
    );
  }

  activeBonuses(date = this.asOf): TransferBonus[] {
    return this.data.transferBonuses.filter((b) => b.startDate <= date && b.endDate >= date);
  }

  /**
   * Best applicable portal rate for a card/channel/component given the date and
   * the card's open date (for transitional rules).
   */
  portalRate(
    cardId: string,
    component: "flight" | "hotel",
    cardOpenedDate?: string,
    date = this.asOf,
  ): PortalRate | undefined {
    const candidates = this.data.portalRates.filter(
      (r) =>
        r.cardId === cardId &&
        r.appliesTo.includes(component) &&
        isEffective(r, date) &&
        (!r.condition?.cardOpenedBefore || (cardOpenedDate !== undefined && cardOpenedDate < r.condition.cardOpenedBefore)),
    );
    return candidates.sort((a, b) => b.centsPerPoint - a.centsPerPoint)[0];
  }
}

function applyOverride(b: Benefit, o?: BenefitOverride): Benefit | null {
  if (!o) return b;
  if (o.disabled) return null;
  return {
    ...b,
    amountCents: o.amountCents ?? b.amountCents,
    verification: o.verification ?? b.verification,
    lastVerified: o.lastVerified ?? b.lastVerified,
  };
}
