import type { AwardOption, FlightOffer, RewardsProgram } from "@/lib/domain/types";
import type { AwardAvailability } from "./types";

/**
 * Attach route-level award availability to flight offers.
 * A cached row applies to an offer when origin, destination, date and cabin
 * match and the program can book the offer's carrier (and, when the source
 * lists carriers, the carrier is among them). Cached/confirmed data replaces
 * any modelled estimate for the same program; estimates for other programs are
 * kept and stay labelled "estimated".
 */
export function attachAwards(offers: FlightOffer[], rows: AwardAvailability[], programs: RewardsProgram[]): FlightOffer[] {
  if (!rows.length) return offers;
  const byId = new Map(programs.map((p) => [p.id, p]));
  return offers.map((o) => {
    const matches = rows.filter(
      (r) =>
        r.origin === o.origin &&
        r.destination === o.destination &&
        r.date === o.date &&
        r.cabin === o.cabin &&
        (byId.get(r.programId)?.bookableCarriers?.includes(o.carrier) ?? false) &&
        (!r.carriers?.length || r.carriers.includes(o.carrier)) &&
        (!r.direct || o.stops === 0),
    );
    if (!matches.length) return o;
    const bestPerProgram = new Map<string, AwardAvailability>();
    for (const m of matches) {
      const cur = bestPerProgram.get(m.programId);
      if (!cur || m.pointsPerPerson < cur.pointsPerPerson) bestPerProgram.set(m.programId, m);
    }
    const fallbackTaxes = (programId: string) => o.awards.find((a) => a.programId === programId)?.taxesPerPersonCents ?? o.awards[0]?.taxesPerPersonCents;
    const live: AwardOption[] = [...bestPerProgram.values()].map((m) => {
      const modelled = o.awards.find((a) => a.programId === m.programId);
      const taxes = m.taxesPerPersonCents ?? fallbackTaxes(m.programId);
      return {
        programId: m.programId,
        pointsPerPerson: m.pointsPerPerson,
        taxesPerPersonCents: taxes ?? 0,
        awardOnlyChargesPerPersonCents: m.taxesPerPersonCents !== undefined ? 0 : (modelled?.awardOnlyChargesPerPersonCents ?? 0),
        availability: m.status,
        verifyUrl: byId.get(m.programId)?.awardSearchUrl,
        source: m.source,
        seenAt: m.seenAt,
        seats: m.seats,
        taxesEstimated: m.taxesPerPersonCents === undefined,
      };
    });
    const kept = o.awards.filter((a) => !bestPerProgram.has(a.programId));
    return { ...o, awards: [...live, ...kept].sort((a, b) => a.pointsPerPerson - b.pointsPerPerson) };
  });
}
