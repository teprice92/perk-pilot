import type { Cabin, DataKind, ExperienceOffer, FlightOffer, HotelOffer, TravelStyle } from "@/lib/domain/types";

/**
 * Provider adapter contracts. Every travel data source (demo, Duffel,
 * Seats.aero, Google Places, Unsplash…) implements one of these so the
 * optimizer never knows or cares where data came from — only its provenance.
 */

export interface FlightSearchParams {
  origin: string;
  destinationAirports: string[];
  departDate: string;
  returnDate: string;
  adults: number;
  children: number;
  cabins: Cabin[];
  flexibleDays: number;
  /** Demo model only: catalogue destination for route modelling. */
  destinationId?: string;
}

export interface DateInsight {
  direction: "outbound" | "return";
  date: string;
  lowestEconomyCents: number;
  deltaVsSelectedCents: number;
}

export interface FlightSearchResult {
  outbound: FlightOffer[];
  return: FlightOffer[];
  dateInsights: DateInsight[];
  provider: string;
  dataKind: DataKind;
  warnings: string[];
}

/** A single one-way leg search (used for multi-city inter-city legs). */
export interface LegSearchParams {
  from: string[];
  to: string[];
  date: string;
  adults: number;
  children: number;
  cabins: Cabin[];
  fromDestinationId?: string;
  toDestinationId?: string;
}

export interface HotelSearchParams {
  destinationId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface ExperienceSearchParams {
  destinationId: string;
  styles: TravelStyle[];
}

/** Route/date/cabin-level award availability from a cached or live source. */
export interface AwardAvailability {
  programId: string;
  origin: string;
  destination: string;
  date: string;
  cabin: Cabin;
  pointsPerPerson: number;
  taxesPerPersonCents?: number;
  seats?: number;
  direct?: boolean;
  /** Operating/marketing carriers if the source reports them. */
  carriers?: string[];
  seenAt: string;
  source: string;
  status: "cached" | "confirmed";
}

export interface AwardSearchParams {
  origin: string;
  destination: string;
  date: string;
  cabins: Cabin[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  category: "flights_cash" | "flights_award" | "hotels" | "hotel_awards" | "experiences" | "maps" | "images" | "card_offers";
  configured: boolean;
  dataKind: DataKind;
  docsUrl?: string;
  notes: string;
  envVars: string[];
}

export interface FlightProvider {
  info(): ProviderInfo;
  searchFlights(params: FlightSearchParams): Promise<FlightSearchResult>;
  /** One-way search between airport sets (multi-city legs). */
  searchLeg?(params: LegSearchParams): Promise<{ offers: FlightOffer[]; warnings: string[] }>;
}

export interface AwardProvider {
  info(): ProviderInfo;
  searchAwards(params: AwardSearchParams): Promise<AwardAvailability[]>;
}

export interface HotelProvider {
  info(): ProviderInfo;
  searchHotels(params: HotelSearchParams): Promise<HotelOffer[]>;
}

export interface ExperienceProvider {
  info(): ProviderInfo;
  searchExperiences(params: ExperienceSearchParams): Promise<ExperienceOffer[]>;
}

export interface ImageResult {
  url: string;
  thumbUrl: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
  source: string;
}
