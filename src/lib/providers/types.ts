import type { Cabin, DataKind, ExperienceOffer, FlightOffer, HotelOffer, TravelStyle } from "@/lib/domain/types";

/**
 * Provider adapter contracts. Every travel data source (demo, Duffel, Amadeus,
 * Seats.aero, hotel APIs, Google Places…) implements one of these so the
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
}

export interface HotelProvider {
  info(): ProviderInfo;
  searchHotels(params: HotelSearchParams): Promise<HotelOffer[]>;
}

export interface ExperienceProvider {
  info(): ProviderInfo;
  searchExperiences(params: ExperienceSearchParams): Promise<ExperienceOffer[]>;
}
