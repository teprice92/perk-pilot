import type { CardOffer } from "@/lib/domain/types";
import type { OptimizationResult, Plan } from "@/lib/optimizer/types";

const CHAIN_WORDS: Record<string, string[]> = {
  hilton: ["hilton", "conrad", "waldorf", "doubletree", "hampton", "embassy suites", "curio", "canopy"],
  marriott: ["marriott", "ritz-carlton", "ritz carlton", "st. regis", "st regis", "w hotels", "westin", "sheraton", "le meridien", "edition", "bonvoy", "jw marriott"],
  hyatt: ["hyatt", "andaz", "alila", "thompson"],
  ihg: ["ihg", "intercontinental", "kimpton", "holiday inn", "crowne plaza", "six senses", "regent"],
  choice: ["choice hotels", "cambria", "comfort inn"],
};

export interface OfferMatch {
  offer: CardOffer;
  slot: string;
  booking: string;
  reason: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[®™]/g, "").trim();

/**
 * Card-linked offers that could apply to a plan's bookings: a hotel or
 * airline offer whose merchant matches the chain or carrier being booked.
 * Informational only — offers aren't added to plan totals.
 */
export function matchOffers(result: OptimizationResult, plan: Plan, offers: CardOffer[], today: string): OfferMatch[] {
  const live = offers.filter((o) => !o.used && (!o.expires || o.expires >= today));
  if (!live.length) return [];
  const matches: OfferMatch[] = [];
  for (const [slot, comp] of Object.entries(plan.components)) {
    if (!comp) continue;
    const opt = comp.option;
    const flight = Object.values(result.flights).flat().find((f) => f.id === opt.offerId);
    const hotel = result.hotels.find((h) => h.id === opt.offerId);
    // Points bookings don't charge the card, so a spend offer can't trigger.
    const paysCash = opt.method === "cash" || opt.method === "program_booking";
    if (hotel) {
      const words = [norm(hotel.name), ...(hotel.chainProgramId ? CHAIN_WORDS[hotel.chainProgramId] ?? [hotel.chainProgramId] : [])];
      for (const o of live.filter((x) => x.category === "hotel" || x.category === "travel")) {
        const m = norm(o.merchant);
        if (words.some((w) => w.includes(m) || m.includes(w))) {
          matches.push({ offer: o, slot, booking: hotel.name, reason: paysCash ? "Pay for this stay with the card that has the offer." : "This plan books the stay with points — the offer only applies if you pay cash on that card." });
        }
      }
    }
    if (flight) {
      const carrier = norm(flight.carrierName);
      for (const o of live.filter((x) => x.category === "airline" || x.category === "travel")) {
        const m = norm(o.merchant);
        if (carrier.includes(m) || m.includes(carrier)) {
          matches.push({ offer: o, slot, booking: `${flight.carrierName} ${flight.origin}→${flight.destination}`, reason: paysCash ? "Pay for this flight with the card that has the offer." : "This plan books the flight with points — the offer only applies to cash fares or taxes on that card." });
        }
      }
    }
  }
  return matches;
}
