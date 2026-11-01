import type { BookingChannel, Cabin } from "@/lib/domain/types";

/**
 * Official/verification deep links. PerkPilot never books — it links users to
 * the place where they can verify price and availability and complete the
 * booking themselves.
 */

export function googleFlightsUrl(from: string, to: string, date: string, opts: { cabin?: Cabin; adults?: number } = {}): string {
  const cabin = opts.cabin && opts.cabin !== "economy" ? ` ${opts.cabin.replace("_", " ")} class` : "";
  const pax = opts.adults && opts.adults > 1 ? ` for ${opts.adults} adults` : "";
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from} to ${to} on ${date}${cabin}${pax} one way`)}`;
}

export function googleHotelsUrl(name: string, city: string, checkIn?: string, checkOut?: string): string {
  const dates = checkIn && checkOut ? ` ${checkIn} to ${checkOut}` : "";
  return `https://www.google.com/travel/hotels?q=${encodeURIComponent(`${name} ${city}${dates}`)}`;
}

const PORTALS: Partial<Record<BookingChannel, string>> = {
  chase_travel: "https://www.chase.com/travel",
  chase_edit: "https://www.chase.com/travel",
  amex_travel: "https://www.americanexpress.com/en-us/travel/",
  amex_fhr: "https://www.americanexpress.com/en-us/travel/fine-hotels-resorts/",
  amex_thc: "https://www.americanexpress.com/en-us/travel/the-hotel-collection/",
  resy: "https://resy.com",
  opentable: "https://www.opentable.com",
  stubhub: "https://www.stubhub.com",
};

export function portalUrl(channel: BookingChannel): string | undefined {
  return PORTALS[channel];
}
