import type { ExperienceOffer, HotelOffer, TravelStyle } from "@/lib/domain/types";
import { googleHotelsUrl } from "@/lib/links";
import { airportInfo } from "@/lib/geo/airports";
import { AIRPORTS, DESTINATIONS, destinationById, findDestination, detectDestinationInText, isPlaceId } from "./catalog";

export { AIRPORTS, DESTINATIONS, destinationById, findDestination, detectDestinationInText };

/**
 * DEMONSTRATION DATA.
 * Hotel names are fictional; landmarks are real places but prices, ratings and
 * booking-program participation are illustrative estimates only. Every offer
 * produced from this file is tagged `dataKind: "demo"` and labelled in the UI.
 */

/* ───────────────────────────── Carriers ───────────────────────────── */

export const CARRIERS: Record<string, { name: string; hubs: string[]; firstClass?: boolean; surchargeLevel: number }> = {
  UA: { name: "United", hubs: ["SFO", "DEN", "ORD", "IAH", "EWR", "IAD", "LAX"], surchargeLevel: 0 },
  DL: { name: "Delta", hubs: ["ATL", "MSP", "DTW", "SEA", "LAX", "JFK", "SLC"], surchargeLevel: 0 },
  AA: { name: "American", hubs: ["DFW", "CLT", "PHL", "MIA", "ORD", "LAX", "PHX", "JFK"], surchargeLevel: 0 },
  AS: { name: "Alaska", hubs: ["SEA", "PDX", "SFO", "LAX", "SAN"], surchargeLevel: 0 },
  HA: { name: "Hawaiian", hubs: ["HNL", "LAX", "SFO", "SEA", "SAN"], surchargeLevel: 0 },
  B6: { name: "JetBlue", hubs: ["JFK", "BOS"], surchargeLevel: 0 },
  WN: { name: "Southwest", hubs: ["LAS", "DEN", "PHX", "DAL", "AUS", "OAK"], surchargeLevel: 0 },
  NH: { name: "ANA", hubs: ["SFO", "LAX", "SEA", "JFK", "ORD", "IAD", "IAH"], firstClass: true, surchargeLevel: 0.2 },
  JL: { name: "Japan Airlines", hubs: ["SFO", "LAX", "JFK", "ORD", "DFW", "BOS", "SEA"], firstClass: true, surchargeLevel: 0.2 },
  AC: { name: "Air Canada", hubs: ["YVR", "YYZ"], surchargeLevel: 0 },
  AF: { name: "Air France", hubs: ["JFK", "LAX", "SFO", "IAD", "BOS", "ATL", "MIA", "ORD", "IAH", "SEA"], surchargeLevel: 0.6 },
  BA: { name: "British Airways", hubs: ["JFK", "BOS", "IAD", "ORD", "LAX", "SFO", "SEA", "MIA", "DFW", "AUS", "PHL"], firstClass: true, surchargeLevel: 1 },
  VS: { name: "Virgin Atlantic", hubs: ["JFK", "BOS", "LAX", "SFO", "IAD", "ATL", "MIA", "SEA"], surchargeLevel: 0.9 },
  TP: { name: "TAP Air Portugal", hubs: ["EWR", "JFK", "BOS", "MIA", "SFO", "ORD", "IAD"], surchargeLevel: 0.3 },
  SQ: { name: "Singapore Airlines", hubs: ["SFO", "LAX", "JFK", "EWR", "SEA"], firstClass: true, surchargeLevel: 0 },
  CX: { name: "Cathay Pacific", hubs: ["SFO", "LAX", "JFK", "BOS", "ORD", "DFW", "SEA"], firstClass: true, surchargeLevel: 0.2 },
  QR: { name: "Qatar Airways", hubs: ["JFK", "IAD", "ORD", "DFW", "MIA", "LAX", "ATL", "BOS"], surchargeLevel: 0.4 },
  EK: { name: "Emirates", hubs: ["JFK", "LAX", "SFO", "SEA", "BOS", "IAD", "ORD", "DFW", "IAH", "MIA"], firstClass: true, surchargeLevel: 1 },
  FI: { name: "Icelandair", hubs: ["JFK", "EWR", "BOS", "IAD", "SEA", "DEN", "ORD", "MSP"], surchargeLevel: 0 },
};

/**
 * Carriers that serve each destination in the demo model. `nonstop` lists US
 * origins with modelled nonstop service; others route via `via`.
 */
export const ROUTES: Record<string, Array<{ carrier: string; nonstop: string[]; via: string }>> = {
  tokyo: [
    { carrier: "NH", nonstop: ["SFO", "LAX", "SEA", "JFK", "ORD", "IAD", "IAH"], via: "SFO" },
    { carrier: "JL", nonstop: ["SFO", "LAX", "JFK", "ORD", "DFW", "BOS", "SEA"], via: "LAX" },
    { carrier: "UA", nonstop: ["SFO", "LAX", "EWR", "IAD", "ORD", "IAH", "DEN"], via: "SFO" },
    { carrier: "DL", nonstop: ["LAX", "SEA", "ATL", "DTW", "MSP"], via: "SEA" },
    { carrier: "AC", nonstop: [], via: "YVR" },
  ],
  kyoto: [
    { carrier: "JL", nonstop: ["LAX"], via: "HND" },
    { carrier: "NH", nonstop: [], via: "HND" },
    { carrier: "UA", nonstop: ["SFO"], via: "SFO" },
    { carrier: "DL", nonstop: ["SEA"], via: "SEA" },
  ],
  maui: [
    { carrier: "HA", nonstop: ["LAX", "SFO", "SEA", "SAN"], via: "HNL" },
    { carrier: "AS", nonstop: ["SEA", "SFO", "LAX", "SAN", "PDX"], via: "SEA" },
    { carrier: "UA", nonstop: ["SFO", "LAX", "DEN", "ORD"], via: "SFO" },
    { carrier: "DL", nonstop: ["LAX", "SEA", "ATL"], via: "LAX" },
    { carrier: "AA", nonstop: ["LAX", "DFW", "PHX"], via: "LAX" },
    { carrier: "WN", nonstop: [], via: "HNL" },
  ],
  "las-vegas": [
    { carrier: "WN", nonstop: ["SFO", "LAX", "SEA", "DEN", "PHX", "ORD", "AUS", "SAN", "PDX", "SLC", "DFW", "BOS", "ATL"], via: "DEN" },
    { carrier: "AS", nonstop: ["SEA", "PDX", "SFO", "LAX", "SAN"], via: "SEA" },
    { carrier: "UA", nonstop: ["SFO", "DEN", "ORD", "IAH", "EWR", "IAD", "LAX"], via: "DEN" },
    { carrier: "DL", nonstop: ["ATL", "MSP", "DTW", "SEA", "LAX", "JFK", "SLC"], via: "SLC" },
    { carrier: "AA", nonstop: ["DFW", "CLT", "PHL", "MIA", "ORD", "LAX", "PHX", "JFK"], via: "DFW" },
    { carrier: "B6", nonstop: ["JFK", "BOS"], via: "JFK" },
  ],
  paris: [
    { carrier: "AF", nonstop: ["JFK", "LAX", "SFO", "IAD", "BOS", "ATL", "MIA", "ORD", "IAH", "SEA"], via: "JFK" },
    { carrier: "DL", nonstop: ["JFK", "ATL", "DTW", "MSP", "BOS", "SEA", "LAX"], via: "JFK" },
    { carrier: "UA", nonstop: ["EWR", "IAD", "ORD", "SFO", "IAH", "DEN"], via: "EWR" },
    { carrier: "AA", nonstop: ["JFK", "DFW", "PHL", "MIA", "CLT"], via: "PHL" },
    { carrier: "B6", nonstop: ["JFK", "BOS"], via: "JFK" },
  ],
  london: [
    { carrier: "BA", nonstop: ["JFK", "BOS", "IAD", "ORD", "LAX", "SFO", "SEA", "MIA", "DFW", "AUS", "PHL", "DEN", "PHX", "ATL", "SAN"], via: "JFK" },
    { carrier: "VS", nonstop: ["JFK", "BOS", "LAX", "SFO", "IAD", "ATL", "MIA", "SEA"], via: "JFK" },
    { carrier: "AA", nonstop: ["JFK", "DFW", "MIA", "ORD", "CLT", "PHL", "LAX"], via: "JFK" },
    { carrier: "UA", nonstop: ["EWR", "IAD", "ORD", "SFO", "IAH", "DEN", "LAX"], via: "EWR" },
    { carrier: "DL", nonstop: ["JFK", "ATL", "DTW", "MSP", "BOS", "SEA", "SLC"], via: "JFK" },
    { carrier: "B6", nonstop: ["JFK", "BOS"], via: "JFK" },
  ],
  rome: [
    { carrier: "DL", nonstop: ["JFK", "ATL"], via: "JFK" },
    { carrier: "UA", nonstop: ["EWR", "IAD", "ORD"], via: "EWR" },
    { carrier: "AA", nonstop: ["JFK", "PHL", "DFW", "CLT", "MIA", "ORD"], via: "PHL" },
    { carrier: "AF", nonstop: [], via: "CDG" },
    { carrier: "BA", nonstop: [], via: "LHR" },
  ],
  lisbon: [
    { carrier: "TP", nonstop: ["EWR", "JFK", "BOS", "MIA", "SFO", "ORD", "IAD"], via: "EWR" },
    { carrier: "UA", nonstop: ["EWR", "IAD"], via: "EWR" },
    { carrier: "DL", nonstop: ["JFK", "ATL", "BOS"], via: "JFK" },
    { carrier: "AA", nonstop: ["PHL", "JFK", "CLT"], via: "PHL" },
    { carrier: "AF", nonstop: [], via: "CDG" },
  ],
  cancun: [
    { carrier: "AA", nonstop: ["DFW", "CLT", "PHL", "MIA", "ORD", "PHX", "JFK", "LAX"], via: "DFW" },
    { carrier: "DL", nonstop: ["ATL", "MSP", "DTW", "JFK", "SLC", "LAX", "SEA"], via: "ATL" },
    { carrier: "UA", nonstop: ["IAH", "EWR", "ORD", "DEN", "SFO", "IAD", "LAX"], via: "IAH" },
    { carrier: "B6", nonstop: ["JFK", "BOS"], via: "JFK" },
    { carrier: "WN", nonstop: ["AUS", "DEN"], via: "AUS" },
    { carrier: "AS", nonstop: ["SEA", "SFO", "LAX", "SAN"], via: "LAX" },
  ],
  "new-york": [
    { carrier: "B6", nonstop: ["SFO", "LAX", "BOS", "SEA", "LAS", "AUS", "MIA", "SAN", "PDX"], via: "BOS" },
    { carrier: "DL", nonstop: ["ATL", "MSP", "DTW", "SEA", "LAX", "SFO", "SLC", "AUS", "LAS", "MIA"], via: "ATL" },
    { carrier: "UA", nonstop: ["SFO", "DEN", "ORD", "IAH", "LAX", "SEA", "LAS", "IAD"], via: "ORD" },
    { carrier: "AA", nonstop: ["DFW", "CLT", "MIA", "ORD", "LAX", "PHX", "SFO"], via: "CLT" },
    { carrier: "AS", nonstop: ["SEA", "SFO", "LAX", "PDX", "SAN"], via: "SEA" },
  ],
  bali: [
    { carrier: "SQ", nonstop: [], via: "SIN" },
    { carrier: "CX", nonstop: [], via: "HKG" },
    { carrier: "QR", nonstop: [], via: "DOH" },
    { carrier: "JL", nonstop: [], via: "HND" },
    { carrier: "EK", nonstop: [], via: "DXB" },
  ],
  reykjavik: [
    { carrier: "FI", nonstop: ["JFK", "EWR", "BOS", "IAD", "SEA", "DEN", "ORD", "MSP"], via: "BOS" },
    { carrier: "DL", nonstop: ["JFK", "MSP"], via: "JFK" },
    { carrier: "UA", nonstop: ["EWR", "ORD"], via: "EWR" },
  ],
};

/* ───────────────────────────── Hotels ───────────────────────────── */

type H = [
  name: string,
  tier: "upscale" | "luxury",
  stars: number,
  neighborhood: string,
  lat: number,
  lng: number,
  nightlyUSD: number,
  chain: string | null,
  programs: HotelOffer["programs"],
  awardPts: number | null,
  breakfast: boolean,
  resortFeeUSD: number,
  hue: number,
  description: string,
  extra?: string[],
];

const HOTELS: Record<string, H[]> = {
  tokyo: [
    ["Aoyama Lantern House", "luxury", 5, "Ginza", 35.6717, 139.765, 1150, null, ["amex_fhr", "chase_edit"], null, false, 0, 340, "Serene high-floor rooms over Ginza with a Japanese-French tasting room."],
    ["Park Meridian Tokyo", "luxury", 5, "Roppongi", 35.6627, 139.7313, 920, "hyatt", ["amex_fhr"], 35000, false, 0, 210, "A Hyatt-affiliated tower with skyline spa and city-view suites.", ["chase_select_brand"]],
    ["Shibuya Cedar Hotel", "upscale", 4, "Shibuya", 35.658, 139.7016, 410, "marriott", ["amex_thc"], 62000, false, 0, 25, "Design-forward hotel steps from the scramble crossing."],
    ["Sumida River Inn", "upscale", 4, "Asakusa", 35.7101, 139.7966, 290, "ihg", [], 45000, true, 0, 190, "Calm riverside rooms near Sensō-ji with breakfast included.", ["chase_select_brand"]],
    ["Shinjuku Skyline Grand", "upscale", 4, "Shinjuku", 35.6938, 139.7034, 360, "hilton", ["amex_thc"], 80000, false, 0, 260, "Large rooms, great transit links and a rooftop bar."],
  ],
  kyoto: [
    ["Higashiyama Moss Garden Ryokan", "luxury", 5, "Higashiyama", 34.9985, 135.7809, 1250, null, ["amex_fhr", "chase_edit"], null, true, 0, 110, "Tatami suites, private onsen baths and seasonal kaiseki."],
    ["Kamo River Pavilion", "luxury", 5, "Downtown", 35.0094, 135.7712, 880, "hyatt", ["amex_fhr"], 30000, false, 0, 30, "Riverside retreat with a celebrated spa.", ["chase_select_brand"]],
    ["Gion Lantern Hotel", "upscale", 4, "Gion", 35.0037, 135.7756, 420, "marriott", ["amex_thc"], 55000, false, 0, 355, "Walk to Gion's teahouse lanes from this boutique property."],
    ["Arashiyama Bamboo Lodge", "upscale", 4, "Arashiyama", 35.0094, 135.6668, 330, null, ["chase_edit"], null, true, 0, 140, "Quiet lodge near the bamboo grove with river views."],
  ],
  maui: [
    ["Wailea Tidepool Resort", "luxury", 5, "Wailea", 20.6853, -156.4426, 1080, null, ["amex_fhr", "chase_edit"], null, false, 50, 190, "Oceanfront villas, adult pool and sunset canoe rides."],
    ["Kā'anapali Coral Grand", "luxury", 5, "Kā'anapali", 20.9262, -156.6942, 760, "hyatt", ["amex_fhr"], 35000, false, 45, 180, "Classic beachfront resort with lagoon pools.", ["chase_select_brand"]],
    ["Makena Shores Hotel", "upscale", 4, "Wailea", 20.6564, -156.4413, 520, "marriott", ["amex_thc"], 85000, false, 40, 165, "Relaxed resort with snorkel-ready beach access."],
    ["Upcountry Jacaranda Inn", "upscale", 4, "Upcountry", 20.8297, -156.3286, 310, null, [], null, true, 0, 95, "Countryside inn on Haleakalā's slopes with farm breakfasts."],
    ["Napili Bay Hilton Villas", "upscale", 4, "Kā'anapali", 20.995, -156.6667, 470, "hilton", ["amex_thc"], 95000, false, 35, 200, "Spacious villas with kitchens on a calm bay."],
  ],
  "las-vegas": [
    ["The Obsidian Tower", "luxury", 5, "Center Strip", 36.1129, -115.1765, 520, null, ["amex_fhr", "chase_edit"], null, false, 50, 280, "Non-gaming luxury tower with suites over the fountains."],
    ["Mirage Point Resort", "luxury", 5, "Center Strip", 36.1212, -115.1697, 410, "hyatt", ["amex_fhr"], 25000, false, 45, 300, "Hyatt-affiliated resort with a sprawling pool complex.", ["chase_select_brand"]],
    ["Desert Bloom Hotel & Casino", "upscale", 4, "South Strip", 36.1024, -115.1745, 230, "marriott", ["amex_thc"], 45000, false, 45, 20, "Lively resort with top restaurants and a residency theater."],
    ["Fremont Lantern House", "upscale", 4, "Downtown", 36.1699, -115.1398, 140, "ihg", [], 30000, false, 30, 45, "Boutique downtown stay near the Arts District.", ["chase_select_brand"]],
    ["Red Rock Canyon Lodge", "upscale", 4, "Red Rock", 36.1572, -115.3133, 260, "hilton", ["amex_thc"], 60000, false, 40, 15, "Desert spa resort minutes from canyon trails."],
  ],
  paris: [
    ["Maison Saint-Honoré", "luxury", 5, "8th Arr.", 48.8698, 2.3116, 1450, null, ["amex_fhr", "chase_edit"], null, false, 0, 330, "Palace-style suites, a Michelin-starred restaurant and a courtyard garden."],
    ["Hôtel Rive Gauche", "luxury", 5, "Saint-Germain", 48.8539, 2.3338, 980, "hyatt", ["amex_fhr"], 40000, false, 0, 15, "Left Bank elegance with a hidden spa.", ["chase_select_brand"]],
    ["Le Marais Atelier", "upscale", 4, "Le Marais", 48.8589, 2.3626, 460, "marriott", ["amex_thc"], 70000, false, 0, 210, "Boutique hotel in a 17th-century townhouse."],
    ["Montmartre Belvédère", "upscale", 4, "Montmartre", 48.8867, 2.3431, 310, "ihg", [], 50000, true, 0, 270, "Hilltop hotel with views toward Sacré-Cœur.", ["chase_select_brand"]],
    ["Opéra Grand Hilton", "upscale", 4, "8th Arr.", 48.8754, 2.3254, 520, "hilton", ["amex_thc"], 90000, false, 0, 45, "Belle-époque grandeur near the department stores."],
  ],
  london: [
    ["The Mayfair Lark", "luxury", 5, "Mayfair", 51.5099, -0.1494, 1250, null, ["amex_fhr", "chase_edit"], null, false, 0, 230, "Townhouse luxury steps from Hyde Park."],
    ["Strand Hyatt House", "luxury", 5, "Covent Garden", 51.5106, -0.1205, 820, "hyatt", ["amex_fhr"], 35000, false, 0, 200, "Riverside rooms in theatreland.", ["chase_select_brand"]],
    ["South Bank Wharf Hotel", "upscale", 4, "South Bank", 51.5055, -0.1132, 420, "marriott", ["amex_thc"], 60000, false, 0, 190, "Thames-view rooms beside the National Theatre."],
    ["Shoreditch Foundry", "upscale", 4, "Shoreditch", 51.5246, -0.0786, 290, "ihg", [], 42000, false, 0, 15, "Converted warehouse in London's creative quarter.", ["chase_select_brand"]],
    ["Park Lane Hilton Grand", "upscale", 4, "Mayfair", 51.5052, -0.1513, 470, "hilton", ["amex_thc"], 95000, false, 0, 260, "Classic rooms with views over the park."],
  ],
  rome: [
    ["Palazzo Aurelia", "luxury", 5, "Centro Storico", 41.9009, 12.4833, 1180, null, ["amex_fhr", "chase_edit"], null, false, 0, 25, "Renaissance palazzo with a rooftop terrace over the domes."],
    ["Spanish Steps Hyatt Residence", "luxury", 5, "Centro Storico", 41.9059, 12.4823, 790, "hyatt", ["amex_fhr"], 30000, false, 0, 15, "Elegant rooms near Via Condotti.", ["chase_select_brand"]],
    ["Trastevere Garden Hotel", "upscale", 4, "Trastevere", 41.8894, 12.4695, 330, "marriott", ["amex_thc"], 50000, true, 0, 100, "Ivy-covered courtyard in Rome's most charming quarter."],
    ["Monti Corner House", "upscale", 4, "Monti", 41.8955, 12.4925, 260, null, [], null, true, 0, 30, "Boutique stay a short walk from the Colosseum."],
  ],
  lisbon: [
    ["Palácio Chiado Lumière", "luxury", 5, "Chiado", 38.7107, -9.1425, 690, null, ["amex_fhr", "chase_edit"], null, false, 0, 30, "Restored palace with river-view suites and a tile-lined spa."],
    ["Príncipe Real Garden Hotel", "luxury", 5, "Príncipe Real", 38.7173, -9.1496, 520, "hyatt", ["amex_fhr"], 20000, false, 0, 120, "Leafy boutique with an excellent rooftop.", ["chase_select_brand"]],
    ["Alfama Fado House", "upscale", 4, "Alfama", 38.7118, -9.1303, 240, null, ["chase_edit"], null, true, 0, 200, "Intimate rooms near the castle with nightly fado."],
    ["Avenida Marriott Lisboa", "upscale", 4, "Chiado", 38.7194, -9.1427, 280, "marriott", ["amex_thc"], 40000, false, 0, 210, "Grand avenue hotel with easy metro access."],
  ],
  cancun: [
    ["Playa Esmeralda Resort", "luxury", 5, "Playa del Carmen", 20.6617, -87.0518, 980, null, ["amex_fhr", "chase_edit"], null, true, 0, 175, "Adults-only beachfront suites with private plunge pools."],
    ["Riviera Hyatt Ziva", "luxury", 5, "Hotel Zone", 21.1365, -86.7416, 720, "hyatt", [], 25000, true, 0, 185, "All-inclusive resort on the lagoon point.", ["chase_select_brand"]],
    ["Tulum Jungle Retreat", "luxury", 5, "Tulum", 20.2021, -87.4511, 640, null, ["chase_edit"], null, true, 0, 120, "Treehouse suites near cenotes and the ruins."],
    ["Hotel Zone Marriott Cove", "upscale", 4, "Hotel Zone", 21.0907, -86.7728, 380, "marriott", ["amex_thc"], 50000, false, 30, 195, "Lively family-friendly beachfront resort."],
  ],
  "new-york": [
    ["The Gramercy Atelier", "luxury", 5, "Midtown", 40.7638, -73.9734, 1150, null, ["amex_fhr", "chase_edit"], null, false, 0, 45, "Art-deco landmark with suites overlooking Central Park."],
    ["Hudson Yards Hyatt Tower", "luxury", 5, "Midtown", 40.7536, -74.0007, 760, "hyatt", ["amex_fhr"], 40000, false, 0, 220, "Sleek tower with skyline-view spa.", ["chase_select_brand"]],
    ["SoHo Loft Hotel", "upscale", 4, "SoHo", 40.7233, -74.003, 520, "marriott", ["amex_thc"], 85000, false, 0, 15, "Industrial-chic lofts on cobblestone streets."],
    ["Williamsburg Waterfront Inn", "upscale", 4, "Brooklyn", 40.7181, -73.9632, 390, "ihg", [], 55000, false, 0, 200, "Brooklyn rooftop with Manhattan skyline views.", ["chase_select_brand"]],
    ["West Village Townhouse", "upscale", 4, "West Village", 40.7358, -74.0036, 610, null, ["chase_edit"], null, true, 0, 330, "Intimate brownstone hotel with a garden café."],
  ],
  bali: [
    ["Ubud Rainforest Sanctuary", "luxury", 5, "Ubud", -8.4975, 115.2443, 620, null, ["amex_fhr", "chase_edit"], null, true, 0, 130, "Pool villas suspended over a jungle river gorge."],
    ["Uluwatu Cliff Hyatt", "luxury", 5, "Uluwatu", -8.8291, 115.0849, 480, "hyatt", ["amex_fhr"], 20000, true, 0, 190, "Clifftop resort with a famous sunset bar.", ["chase_select_brand"]],
    ["Seminyak Beach Marriott", "upscale", 4, "Seminyak", -8.6913, 115.1563, 260, "marriott", ["amex_thc"], 35000, false, 0, 30, "Stylish beachfront resort near boutiques."],
    ["Nusa Dua Lagoon Hilton", "upscale", 4, "Nusa Dua", -8.8008, 115.2317, 220, "hilton", ["amex_thc"], 50000, true, 0, 175, "Calm-water lagoon resort for families and couples."],
  ],
  reykjavik: [
    ["Harpa Northern Lights Hotel", "luxury", 5, "Downtown", 64.1504, -21.9325, 780, null, ["amex_fhr", "chase_edit"], null, true, 0, 205, "Harbourfront luxury with geothermal spa and aurora wake-up calls."],
    ["Golden Circle Glass Lodge", "luxury", 5, "Golden Circle", 64.2559, -20.5217, 690, null, ["chase_edit"], null, true, 0, 220, "Glass-roof suites for aurora viewing from bed."],
    ["Reykjavík Marriott Edition", "upscale", 4, "Downtown", 64.1471, -21.9367, 420, "marriott", ["amex_thc"], 60000, false, 0, 200, "Modern design hotel near Laugavegur."],
    ["South Coast Basalt Inn", "upscale", 4, "South Coast", 63.4194, -19.0059, 330, null, [], null, true, 0, 190, "Cozy base for black-sand beaches and glacier hikes."],
  ],
};

/* ───────────────────────────── Experiences ───────────────────────────── */

type E = [
  name: string,
  category: ExperienceOffer["category"],
  styles: TravelStyle[],
  priceUSD: number,
  durationMin: number,
  bestTime: ExperienceOffer["bestTime"],
  neighborhood: string,
  lat: number,
  lng: number,
  rating: number,
  premium: boolean,
  tags: string[],
  description: string,
];

const EXPERIENCES: Record<string, E[]> = {
  tokyo: [
    ["Tsukiji Outer Market breakfast crawl", "food", ["food", "culture"], 95, 180, "morning", "Ginza", 35.6655, 139.7707, 4.8, false, [], "Tamagoyaki, uni and the best coffee in the market lanes with a local guide."],
    ["Omakase counter dinner (demo listing)", "dining", ["food", "romantic", "luxury"], 320, 150, "evening", "Ginza", 35.6705, 139.7635, 4.9, true, [], "Twenty-course seasonal omakase at an intimate eight-seat counter."],
    ["Sensō-ji & Asakusa at dawn", "culture", ["culture"], 0, 120, "morning", "Asakusa", 35.7148, 139.7967, 4.7, false, [], "Tokyo's oldest temple before the crowds, then rice crackers on Nakamise."],
    ["teamLab-style digital art museum", "museum", ["culture", "romantic", "family"], 38, 150, "afternoon", "Toyosu", 35.6491, 139.7898, 4.6, false, [], "Immersive light installations — book timed entry in advance."],
    ["Shinjuku izakaya & Golden Gai night walk", "nightlife", ["nightlife", "food"], 120, 210, "evening", "Shinjuku", 35.6938, 139.7036, 4.8, false, [], "Yakitori alleys and tiny bars with a guide who knows every door."],
    ["Private onsen day spa", "wellness", ["wellness", "romantic"], 180, 180, "afternoon", "Odaiba", 35.6197, 139.7798, 4.5, true, [], "Private hot-spring bath and massage for two."],
    ["Meiji Shrine & Harajuku stroll", "culture", ["culture", "shopping"], 0, 150, "morning", "Shibuya", 35.6764, 139.6993, 4.6, false, [], "Forest-shrouded shrine then the boutiques of Omotesando."],
    ["Sumo morning practice visit", "event", ["culture", "adventure"], 85, 150, "morning", "Ryōgoku", 35.6969, 139.7933, 4.7, false, [], "Watch wrestlers train up close at a stable (seasonal)."],
    ["Tokyo Bay sunset cruise", "nature", ["romantic"], 75, 120, "evening", "Odaiba", 35.6267, 139.7753, 4.4, false, [], "Skyline views and cocktails as the city lights up."],
  ],
  kyoto: [
    ["Fushimi Inari sunrise hike", "nature", ["nature", "culture", "adventure"], 0, 180, "morning", "Fushimi", 34.9671, 135.7727, 4.9, false, [], "Thousands of vermilion torii gates, nearly empty at dawn."],
    ["Private tea ceremony in a machiya", "culture", ["culture", "romantic"], 110, 90, "afternoon", "Gion", 35.0027, 135.7751, 4.8, false, [], "Matcha ritual with a tea master in a 100-year-old townhouse."],
    ["Kaiseki dinner (demo listing)", "dining", ["food", "romantic", "luxury"], 260, 150, "evening", "Higashiyama", 34.9988, 135.7812, 4.9, true, [], "Multi-course seasonal kaiseki in a garden setting."],
    ["Arashiyama bamboo grove & monkey park", "nature", ["nature", "family"], 10, 210, "morning", "Arashiyama", 35.017, 135.6713, 4.6, false, [], "The famous bamboo path, Tenryū-ji gardens and river views."],
    ["Nishiki Market tasting walk", "food", ["food"], 85, 150, "afternoon", "Downtown", 35.005, 135.7649, 4.7, false, [], "Pickles, mochi and grilled seafood on 'Kyoto's kitchen'."],
    ["Gion evening geisha district walk", "culture", ["culture", "romantic"], 45, 90, "evening", "Gion", 35.0036, 135.7785, 4.6, false, [], "Lantern-lit Hanamikoji with a historian guide."],
    ["Kinkaku-ji Golden Pavilion", "culture", ["culture"], 5, 90, "afternoon", "Kitayama", 35.0394, 135.7292, 4.7, false, [], "The gold-leafed pavilion reflected in its mirror pond."],
  ],
  maui: [
    ["Haleakalā summit sunrise", "nature", ["nature", "adventure", "romantic"], 30, 300, "morning", "Upcountry", 20.7097, -156.2533, 4.9, false, [], "Watch the sun rise above the clouds at 10,000 ft — reservation required."],
    ["Molokini snorkel catamaran", "adventure", ["adventure", "nature", "family"], 165, 300, "morning", "Wailea", 20.6328, -156.4964, 4.7, false, [], "Snorkel the crescent crater with sea turtles and reef fish."],
    ["Road to Hāna private tour", "nature", ["nature", "adventure"], 260, 600, "morning", "Hāna", 20.7575, -155.9884, 4.8, true, [], "Waterfalls, black-sand beaches and banana bread stands."],
    ["Oceanfront dinner (demo listing)", "dining", ["food", "romantic", "luxury"], 210, 150, "evening", "Pā'ia", 20.9237, -156.3832, 4.8, true, ["resy"], "Fresh-caught fish on the water — reservations open 30 days out."],
    ["Traditional lū'au", "culture", ["culture", "family", "food"], 220, 180, "evening", "Lahaina", 20.8783, -156.6825, 4.7, false, [], "Hawaiian storytelling, hula and an imu feast."],
    ["Couples spa ritual", "wellness", ["wellness", "romantic"], 290, 120, "afternoon", "Wailea", 20.6874, -156.4417, 4.6, true, [], "Lomi lomi massage in an open-air cabana."],
    ["Upcountry farm & winery tasting", "food", ["food", "nature"], 65, 150, "afternoon", "Upcountry", 20.6705, -156.3393, 4.5, false, ["resy"], "Lavender farm, goat dairy and pineapple wine."],
  ],
  "las-vegas": [
    ["Cirque-style residency show", "event", ["nightlife", "family"], 165, 120, "evening", "Center Strip", 36.1126, -115.1767, 4.8, false, ["stubhub"], "Acrobatic spectacle in a purpose-built theatre."],
    ["Headliner concert residency", "event", ["nightlife"], 240, 150, "evening", "Center Strip", 36.1162, -115.1745, 4.7, true, ["stubhub"], "A major artist's residency — compare seats on StubHub."],
    ["Chef's steakhouse dinner (demo listing)", "dining", ["food", "luxury", "romantic"], 220, 150, "evening", "Center Strip", 36.1127, -115.1722, 4.8, true, ["resy", "sapphire_tables"], "Dry-aged steaks and a famous wine list."],
    ["Red Rock Canyon guided hike", "nature", ["nature", "adventure"], 95, 240, "morning", "Red Rock", 36.1357, -115.4277, 4.8, false, [], "Desert trails and petroglyphs 30 minutes from the Strip."],
    ["Grand Canyon West Rim helicopter", "adventure", ["adventure", "romantic", "luxury"], 520, 300, "morning", "Grand Canyon West", 36.0119, -113.8108, 4.7, true, [], "Fly over Hoover Dam and land inside the canyon."],
    ["High Roller observation wheel", "nightlife", ["romantic", "family"], 35, 60, "evening", "Center Strip", 36.1175, -115.1682, 4.5, false, [], "30-minute rotation with views across the valley."],
    ["Resort pool cabana day", "wellness", ["wellness", "luxury"], 180, 300, "afternoon", "South Strip", 36.0955, -115.176, 4.4, true, [], "Shaded cabana, bottle service optional."],
    ["Downtown Arts District food tour", "food", ["food", "culture"], 85, 180, "afternoon", "Downtown", 36.1585, -115.1525, 4.6, false, ["resy"], "Tacos, craft beer and murals off the Strip."],
  ],
  paris: [
    ["Louvre highlights with an art historian", "museum", ["culture"], 95, 180, "morning", "1st Arr.", 48.8606, 2.3376, 4.8, false, [], "Skip-the-line timed entry and the masterpieces that matter."],
    ["Seine dinner cruise", "dining", ["romantic", "food"], 160, 150, "evening", "7th Arr.", 48.8606, 2.2976, 4.5, false, [], "Gliding past illuminated monuments with a three-course menu."],
    ["Michelin bistro tasting menu (demo listing)", "dining", ["food", "romantic", "luxury"], 240, 150, "evening", "Saint-Germain", 48.8531, 2.3349, 4.8, true, [], "Modern French tasting menu in a 30-seat dining room."],
    ["Le Marais food & wine walk", "food", ["food", "culture"], 110, 180, "afternoon", "Le Marais", 48.8575, 2.3591, 4.7, false, [], "Falafel, fromagerie stops and natural wine."],
    ["Musée d'Orsay impressionists", "museum", ["culture"], 20, 150, "afternoon", "7th Arr.", 48.86, 2.3266, 4.8, false, [], "Monet, Degas and Van Gogh in a Beaux-Arts station."],
    ["Montmartre painters' walk", "culture", ["culture", "romantic"], 30, 120, "morning", "Montmartre", 48.8867, 2.3431, 4.6, false, [], "Village lanes, vineyards and Sacré-Cœur views."],
    ["Versailles by e-bike", "adventure", ["adventure", "culture"], 130, 420, "morning", "Versailles", 48.8049, 2.1204, 4.7, false, [], "Gardens, Marie-Antoinette's hamlet and the Hall of Mirrors."],
    ["Hammam & spa afternoon", "wellness", ["wellness", "romantic"], 150, 150, "afternoon", "Le Marais", 48.8566, 2.3615, 4.4, true, [], "Steam, scrub and massage in a hidden courtyard spa."],
  ],
  london: [
    ["West End musical", "event", ["culture", "nightlife", "family"], 120, 165, "evening", "Covent Garden", 51.5115, -0.1235, 4.8, false, ["stubhub"], "Compare seats across official box office and resale."],
    ["British Museum highlights (free entry)", "museum", ["culture", "family"], 0, 150, "morning", "Bloomsbury", 51.5194, -0.127, 4.8, false, [], "The Rosetta Stone, Parthenon sculptures and more."],
    ["Borough Market tasting tour", "food", ["food"], 85, 150, "morning", "South Bank", 51.5055, -0.091, 4.7, false, [], "Cheese, scotch eggs and the best doughnuts in town."],
    ["Afternoon tea in Mayfair (demo listing)", "dining", ["food", "romantic", "luxury"], 95, 120, "afternoon", "Mayfair", 51.5098, -0.1468, 4.7, true, [], "Finger sandwiches, scones and champagne."],
    ["Tower of London & Crown Jewels", "culture", ["culture", "family"], 45, 180, "morning", "Tower Hill", 51.5081, -0.0759, 4.7, false, [], "Beefeater tales and royal regalia."],
    ["Thames sunset RIB ride", "adventure", ["adventure", "romantic"], 70, 60, "evening", "South Bank", 51.5033, -0.1196, 4.6, false, [], "High-speed river ride past Tower Bridge at golden hour."],
    ["Shoreditch street art & pubs", "nightlife", ["nightlife", "culture"], 40, 180, "evening", "Shoreditch", 51.5246, -0.0786, 4.5, false, [], "Banksy-era murals then craft pubs."],
    ["Chef's-table dinner (demo listing)", "dining", ["food", "luxury"], 260, 180, "evening", "Mayfair", 51.5113, -0.1435, 4.8, true, [], "Modern British tasting menu."],
  ],
  rome: [
    ["Colosseum underground & Forum", "culture", ["culture", "adventure"], 110, 210, "morning", "Monti", 41.8902, 12.4922, 4.8, false, [], "Access the hypogeum where gladiators waited."],
    ["Vatican Museums & Sistine Chapel early entry", "museum", ["culture"], 130, 210, "morning", "Prati", 41.9065, 12.4536, 4.8, false, [], "Beat the crowds to Michelangelo's ceiling."],
    ["Trastevere food tour", "food", ["food", "culture"], 95, 210, "evening", "Trastevere", 41.8894, 12.4695, 4.8, false, [], "Supplì, cacio e pepe and gelato with a local."],
    ["Pasta-making class", "food", ["food", "romantic", "family"], 85, 180, "afternoon", "Centro Storico", 41.8986, 12.4769, 4.7, false, [], "Hand-roll fettuccine and ravioli, then eat it."],
    ["Rooftop aperitivo at sunset (demo listing)", "dining", ["romantic", "nightlife"], 60, 90, "evening", "Centro Storico", 41.9009, 12.4833, 4.6, false, [], "Spritzes with views over the domes."],
    ["Borghese Gallery & gardens", "museum", ["culture", "romantic"], 30, 150, "afternoon", "Villa Borghese", 41.9142, 12.4921, 4.8, false, [], "Bernini sculptures — timed tickets sell out."],
    ["Fine-dining Roman tasting menu (demo listing)", "dining", ["food", "luxury"], 280, 180, "evening", "Prati", 41.9093, 12.4628, 4.8, true, [], "Modern Roman cuisine with a celebrated cellar."],
  ],
  lisbon: [
    ["Alfama walking tour & fado dinner", "culture", ["culture", "romantic", "food"], 90, 240, "evening", "Alfama", 38.7118, -9.1303, 4.7, false, [], "Winding lanes by day, soulful fado by candlelight."],
    ["Belém monuments & pastéis", "culture", ["culture", "food"], 25, 180, "morning", "Belém", 38.6916, -9.2159, 4.7, false, [], "Jerónimos Monastery, the tower and the original custard tarts."],
    ["Sintra palaces day trip", "adventure", ["adventure", "culture", "nature"], 120, 480, "morning", "Sintra", 38.7876, -9.3906, 4.8, false, [], "Fairy-tale Pena Palace and misty gardens."],
    ["Seafood feast (demo listing)", "dining", ["food"], 70, 120, "evening", "Cais do Sodré", 38.7066, -9.1446, 4.6, false, [], "Clams, prawns and vinho verde."],
    ["Tagus sunset sailing", "nature", ["romantic", "nature"], 55, 120, "evening", "Belém", 38.6936, -9.2058, 4.7, false, [], "Sail under the 25 de Abril bridge at golden hour."],
    ["Tile-painting workshop", "culture", ["culture", "family"], 45, 120, "afternoon", "Chiado", 38.7107, -9.1425, 4.6, false, [], "Paint your own azulejo to take home."],
    ["Chef's tasting menu (demo listing)", "dining", ["food", "luxury", "romantic"], 210, 180, "evening", "Príncipe Real", 38.7173, -9.1496, 4.8, true, [], "Contemporary Portuguese cooking."],
  ],
  cancun: [
    ["Cenote swim & Mayan village", "nature", ["nature", "adventure"], 95, 300, "morning", "Tulum", 20.2463, -87.4634, 4.8, false, [], "Swim in crystal-clear sinkholes."],
    ["Tulum ruins at opening", "culture", ["culture"], 35, 150, "morning", "Tulum", 20.2148, -87.4291, 4.7, false, [], "Clifftop Mayan ruins above turquoise water."],
    ["Isla Mujeres catamaran", "adventure", ["adventure", "romantic"], 110, 420, "morning", "Hotel Zone", 21.2321, -86.7313, 4.6, false, [], "Snorkel the reef and lunch on the island."],
    ["Beachfront tasting dinner (demo listing)", "dining", ["food", "romantic", "luxury"], 180, 150, "evening", "Playa del Carmen", 20.6296, -87.0739, 4.7, true, [], "Yucatecan tasting menu with toes in the sand."],
    ["Chichén Itzá early access", "culture", ["culture", "adventure"], 160, 600, "morning", "Chichén Itzá", 20.6843, -88.5678, 4.8, false, [], "A New Wonder of the World before the crowds."],
    ["Temazcal ceremony", "wellness", ["wellness", "romantic"], 85, 120, "evening", "Tulum", 20.2021, -87.4511, 4.5, false, [], "Traditional Mayan sweat-lodge ritual."],
  ],
  "new-york": [
    ["Broadway show", "event", ["culture", "nightlife", "family"], 175, 165, "evening", "Midtown", 40.759, -73.9845, 4.8, false, ["stubhub"], "Compare official box office and resale seats."],
    ["The Met highlights", "museum", ["culture"], 30, 180, "morning", "Upper East Side", 40.7794, -73.9632, 4.8, false, [], "Egyptian temples to Impressionists."],
    ["Tasting-menu dinner (demo listing)", "dining", ["food", "luxury", "romantic"], 295, 180, "evening", "SoHo", 40.7233, -74.003, 4.8, true, ["resy"], "Seasonal tasting menu at a chef's counter."],
    ["West Village Italian dinner (demo listing)", "dining", ["food", "romantic"], 120, 120, "evening", "West Village", 40.7335, -74.0027, 4.7, false, ["sapphire_tables"], "Handmade pasta and candlelight."],
    ["Central Park bike loop", "nature", ["nature", "adventure", "family"], 35, 150, "morning", "Central Park", 40.7812, -73.9665, 4.6, false, [], "Six miles of loops past Bethesda Fountain."],
    ["Brooklyn Bridge & DUMBO pizza walk", "food", ["food", "culture"], 65, 180, "afternoon", "Brooklyn", 40.7033, -73.9881, 4.7, false, [], "Walk the bridge, then coal-oven pizza."],
    ["Rooftop jazz & cocktails", "nightlife", ["nightlife", "romantic"], 80, 150, "evening", "Midtown", 40.7484, -73.9857, 4.5, false, ["resy"], "Live jazz with the Empire State Building as backdrop."],
    ["Knicks or Nets game", "event", ["nightlife", "family"], 140, 180, "evening", "Midtown", 40.7505, -73.9934, 4.6, false, ["stubhub"], "Courtside energy — seasonal."],
  ],
  bali: [
    ["Tegallalang rice terraces at sunrise", "nature", ["nature", "romantic"], 25, 180, "morning", "Ubud", -8.4319, 115.279, 4.7, false, [], "Emerald terraces in the soft morning light."],
    ["Uluwatu temple kecak fire dance", "culture", ["culture", "romantic"], 15, 150, "evening", "Uluwatu", -8.8291, 115.0849, 4.8, false, [], "Clifftop performance at sunset."],
    ["Balinese cooking class & market", "food", ["food", "culture", "family"], 45, 300, "morning", "Ubud", -8.5069, 115.2625, 4.8, false, [], "Morning market then cook a full Balinese feast."],
    ["Couples' Balinese spa ritual", "wellness", ["wellness", "romantic", "luxury"], 140, 180, "afternoon", "Ubud", -8.4975, 115.2443, 4.8, true, [], "Boreh scrub, flower bath and massage."],
    ["Mount Batur sunrise trek", "adventure", ["adventure", "nature"], 60, 420, "morning", "Kintamani", -8.2422, 115.375, 4.7, false, [], "Hike an active volcano in the dark for sunrise."],
    ["Jungle-view tasting dinner (demo listing)", "dining", ["food", "luxury", "romantic"], 150, 180, "evening", "Ubud", -8.5017, 115.2585, 4.8, true, [], "Indonesian tasting menu over the valley."],
    ["Nusa Penida day trip", "adventure", ["adventure", "nature"], 95, 600, "morning", "Nusa Penida", -8.7275, 115.5444, 4.6, false, [], "Kelingking Beach and manta-ray snorkelling."],
  ],
  reykjavik: [
    ["Golden Circle small-group tour", "nature", ["nature", "adventure"], 120, 480, "morning", "Golden Circle", 64.3271, -20.1199, 4.8, false, [], "Þingvellir, Geysir and Gullfoss in one day."],
    ["Geothermal lagoon evening soak", "wellness", ["wellness", "romantic"], 110, 180, "evening", "Reykjanes", 63.8804, -22.4495, 4.7, false, [], "Milky-blue waters under the night sky."],
    ["Northern lights super-jeep hunt", "adventure", ["adventure", "romantic", "nature"], 160, 300, "evening", "Downtown", 64.1466, -21.9426, 4.6, false, [], "Chase clear skies away from city lights (seasonal, weather-dependent)."],
    ["South Coast glacier hike", "adventure", ["adventure", "nature"], 140, 600, "morning", "South Coast", 63.5321, -19.3689, 4.8, false, [], "Crampons on Sólheimajökull plus Skógafoss."],
    ["New Nordic tasting menu (demo listing)", "dining", ["food", "luxury"], 220, 180, "evening", "Downtown", 64.1475, -21.9332, 4.7, true, [], "Lamb, langoustine and foraged herbs."],
    ["Reykjavík food walk", "food", ["food", "culture"], 95, 180, "afternoon", "Downtown", 64.1455, -21.9295, 4.7, false, [], "Hot dogs, skyr and rye-bread ice cream."],
  ],
};

/* ─────────────── Template data for the extended catalogue ─────────────── */

/** Home hubs used as the connection point for foreign carriers. */
const HOME_HUB: Record<string, string> = { BA: "LHR", AF: "CDG", VS: "LHR", EK: "DXB", QR: "DOH", SQ: "SIN", CX: "HKG", NH: "HND", JL: "HND", AC: "YYZ", TP: "LIS", FI: "KEF" };
/** International airports with modelled nonstop service from the carriers' US hubs. */
const GATEWAYS = new Set(["BCN", "MAD", "AMS", "ATH", "DUB", "EDI", "ZRH", "IST", "DXB", "SIN", "ICN", "HKG", "SYD", "MEX", "SJD", "LIR", "PLS", "MBJ", "SJU", "YVR", "YYC", "YUL", "LIM", "EZE", "GIG", "NAP", "PPT", "CPT"]);
/** Where US carriers' passengers connect for airports without US nonstops. */
const CONNECT: Record<string, string> = { FLR: "FCO", JTR: "ATH", PRG: "AMS", VIE: "FRA", RAK: "MAD", CUZ: "LIM", BKK: "HND", HKT: "BKK", ZQN: "AKL", MLE: "DOH" };
const US_HUBS = new Set(Object.keys(AIRPORTS).filter((k) => AIRPORTS[k]!.country === "US"));

function carriersForCountry(country: string): string[] {
  if (country === "US") return ["UA", "DL", "AA", "AS"];
  if (country === "CA") return ["AC", "UA", "DL", "AA"];
  if (["MX", "CR", "TC", "JM"].includes(country)) return ["AA", "UA", "DL", "B6"];
  if (["PE", "AR", "BR"].includes(country)) return ["AA", "UA", "DL"];
  if (["ES", "NL", "IT", "GR", "IE", "GB", "CH", "CZ", "AT", "TR"].includes(country)) return ["UA", "DL", "AA", "BA", "AF", "VS"];
  if (["MA"].includes(country)) return ["AF", "BA", "DL"];
  if (["AE"].includes(country)) return ["EK", "QR", "UA"];
  if (["ZA"].includes(country)) return ["UA", "DL", "QR", "EK"];
  if (["SG", "TH", "KR", "HK"].includes(country)) return ["UA", "DL", "SQ", "CX", "NH"];
  if (["MV"].includes(country)) return ["QR", "EK", "SQ"];
  if (["AU", "NZ"].includes(country)) return ["UA", "DL", "AA"];
  if (["PF"].includes(country)) return ["UA", "AF"];
  return ["UA", "DL", "AA"];
}

/** Carriers and nonstop origins for a destination: hand-modelled, or derived from its airport. */
export function routesFor(destinationId: string): Array<{ carrier: string; nonstop: string[]; via: string }> {
  if (ROUTES[destinationId]) return ROUTES[destinationId]!;
  const dest = destinationById(destinationId);
  const airport = dest?.airports[0];
  if (!dest || !airport) return [];
  const info = airportInfo(airport);
  const country = info?.country ?? "US";
  return carriersForCountry(country)
    .filter((c) => CARRIERS[c])
    .map((c) => {
      const usHubs = CARRIERS[c]!.hubs.filter((h) => US_HUBS.has(h) && h !== airport);
      const nonstop = country === "US" || GATEWAYS.has(airport) || (isPlaceId(destinationId) && info?.large && !CONNECT[airport] && ["CA", "MX", "GB", "FR", "DE", "ES", "IT", "NL", "IE", "JP", "KR", "AE"].includes(country)) ? usHubs : [];
      const via = HOME_HUB[c] ?? (nonstop.length ? usHubs[0] : CONNECT[airport]) ?? usHubs[0] ?? "LAX";
      return { carrier: c, nonstop: nonstop.slice(0, 8), via };
    });
}

/** Fictional demo hotels built from the destination's neighbourhoods. */
function templateHotels(destinationId: string): H[] {
  const d = destinationById(destinationId);
  if (!d) return [];
  const city = d.name.split(/ [&(]|,/)[0]!.trim();
  const hood = (i: number) => d.neighborhoods[i % d.neighborhoods.length] ?? city;
  const ci = d.costIndex;
  const usd = (n: number) => Math.round((n * ci) / 5) * 5;
  const pts = (n: number) => Math.round((n * ci) / 5000) * 5000;
  const at = (i: number): [number, number] => [d.lat + [0.006, -0.009, 0.012, -0.004, 0.003][i]!, d.lng + [-0.008, 0.007, 0.004, -0.013, 0.011][i]!];
  return [
    [`The ${hood(0)} House`, "luxury", 5, hood(0), ...at(0), usd(780), null, ["amex_fhr", "chase_edit"], null, true, 0, 30, `An intimate luxury hotel in ${hood(0)} with a destination restaurant and spa (fictional demo property).`],
    [`Park Meridian ${city}`, "luxury", 5, hood(1), ...at(1), usd(560), "hyatt", ["amex_fhr"], Math.min(45000, Math.max(20000, pts(30000))), false, 0, 210, `A Hyatt-affiliated luxury hotel with suites and a rooftop pool (fictional demo property).`, ["chase_select_brand"]],
    [`${hood(2)} Cedar Hotel`, "upscale", 4, hood(2), ...at(2), usd(340), "marriott", ["amex_thc"], Math.max(35000, pts(55000)), false, 0, 140, `Design-led Marriott-family hotel close to ${hood(2)}'s restaurants (fictional demo property).`],
    [`${city} Lantern Inn`, "upscale", 4, hood(3), ...at(3), usd(250), "ihg", [], Math.max(25000, pts(40000)), true, 0, 50, `Comfortable IHG-family hotel with breakfast included (fictional demo property).`, ["chase_select_brand"]],
    [`${hood(1)} Grand`, "upscale", 4, hood(1), ...at(4), usd(300), "hilton", ["amex_thc"], Math.max(40000, pts(70000)), false, d.region === "Caribbean" || d.region === "Hawaii" ? 45 : 0, 260, `Large Hilton-family hotel with a pool and club lounge (fictional demo property).`],
  ];
}

/** Template experiences — generic, clearly-labelled demo listings for the extended catalogue. */
function templateExperiences(destinationId: string): E[] {
  const d = destinationById(destinationId);
  if (!d) return [];
  const city = d.name.split(/ [&(]|,/)[0]!.trim();
  const hood = (i: number) => d.neighborhoods[i % d.neighborhoods.length] ?? city;
  const ci = d.costIndex;
  const usd = (n: number) => Math.round((n * ci) / 5) * 5;
  const at = (i: number): [number, number] => [d.lat + ((i % 5) - 2) * 0.006, d.lng + (((i * 3) % 7) - 3) * 0.005];
  return [
    [`${city} food & market walk (demo listing)`, "food", ["food", "culture"], usd(95), 180, "morning", hood(0), ...at(0), 4.8, false, [], `Taste your way through ${city}'s markets and local specialities with a guide.`],
    [`Chef's tasting dinner (demo listing)`, "dining", ["food", "romantic", "luxury"], usd(240), 150, "evening", hood(1), ...at(1), 4.8, true, [], "A multi-course seasonal tasting menu at one of the city's acclaimed restaurants."],
    [`${hood(2)} history walk (demo listing)`, "culture", ["culture"], usd(35), 150, "morning", hood(2), ...at(2), 4.7, false, [], `The landmarks and back streets of ${hood(2)} with a local historian.`],
    [`Top art museum visit (demo listing)`, "museum", ["culture", "family"], usd(30), 150, "afternoon", hood(0), ...at(3), 4.6, false, [], "Timed entry to the city's best-loved museum — book ahead in high season."],
    [`Sunset views & cocktails (demo listing)`, "nature", ["romantic", "nature"], usd(70), 120, "evening", hood(3), ...at(4), 4.6, false, [], "Golden-hour views from the best vantage point in town, drinks included."],
    [`Spa afternoon for two (demo listing)`, "wellness", ["wellness", "romantic"], usd(190), 180, "afternoon", hood(1), ...at(5), 4.6, true, [], "Treatments, thermal pools and a relaxed afternoon."],
    [`Guided outdoor day trip (demo listing)`, "adventure", ["adventure", "nature"], usd(140), 360, "morning", hood(3), ...at(6), 4.7, false, [], `A small-group hike, bike or boat day in the countryside around ${city}.`],
    [`Cocktail bar crawl (demo listing)`, "nightlife", ["nightlife", "food"], usd(110), 180, "evening", hood(2), ...at(7), 4.5, false, [], "Three of the best bars in town with a guide who knows the bartenders."],
    [`Family highlights tour (demo listing)`, "event", ["family", "culture"], usd(60), 180, "afternoon", hood(0), ...at(8), 4.5, false, [], "A kid-friendly loop of the city's must-sees, at a gentle pace."],
  ];
}

/* ───────────────────────────── Builders ───────────────────────────── */


/** Detect a known destination mentioned anywhere in free text. */

export function buildHotels(destinationId: string, seasonFactor: number, fetchedAt: string): HotelOffer[] {
  return (HOTELS[destinationId] ?? templateHotels(destinationId)).map((h, i) => {
    const [name, tier, stars, neighborhood, lat, lng, nightlyUSD, chain, programs, awardPts, breakfast, resortFeeUSD, hue, description, extraTags = []] = h;
    const amenities = [
      tier === "luxury" ? "Spa" : "Fitness center",
      "Wi-Fi",
      breakfast ? "Breakfast included" : "Restaurant",
      ...(resortFeeUSD > 0 ? ["Pool"] : []),
    ];
    return {
      id: `demo-hotel-${destinationId}-${i}`,
      destinationId,
      provider: "PerkPilot Demo",
      dataKind: "demo" as const,
      fetchedAt,
      name,
      description,
      tier,
      stars,
      rating: tier === "luxury" ? 4.8 - (i % 2) * 0.1 : 4.5 - (i % 3) * 0.1,
      chainProgramId: chain ?? undefined,
      neighborhood,
      lat,
      lng,
      nightlyCashCents: Math.round(nightlyUSD * seasonFactor) * 100,
      taxesPct: destinationId === "maui" ? 0.18 : destinationId === "new-york" ? 0.148 : destinationId === "las-vegas" ? 0.134 : 0.12,
      resortFeePerNightCents: resortFeeUSD * 100,
      includesBreakfast: breakfast,
      refundable: i % 3 !== 2,
      cancellationPolicy: i % 3 !== 2 ? "Free cancellation until 3 days before arrival (demo)" : "Non-refundable rate (demo)",
      programs,
      award: chain && awardPts ? { programId: chain, pointsPerNight: awardPts, availability: "estimated" as const } : undefined,
      amenities,
      tags: [...extraTags, ...programs.map((p) => (p === "amex_fhr" ? "fhr" : p === "amex_thc" ? "thc" : "the_edit"))],
      hue,
      bookingUrl: googleHotelsUrl(name, destinationById(destinationId)?.name ?? destinationId.replace("-", " ")),
    };
  });
}

export function buildExperiences(destinationId: string): ExperienceOffer[] {
  return (EXPERIENCES[destinationId] ?? templateExperiences(destinationId)).map((e, i) => {
    const [name, category, styles, priceUSD, durationMin, bestTime, neighborhood, lat, lng, rating, premium, tags, description] = e;
    return {
      id: `demo-exp-${destinationId}-${i}`,
      destinationId,
      provider: "PerkPilot Demo",
      dataKind: "demo" as const,
      name,
      description,
      category,
      styles,
      pricePerPersonCents: priceUSD * 100,
      durationMin,
      bestTime,
      neighborhood,
      lat,
      lng,
      rating,
      premium,
      tags,
      bookingUrl: `https://www.google.com/search?q=${encodeURIComponent(name.replace(" (demo listing)", "") + " " + (destinationById(destinationId)?.name ?? destinationId.replace("-", " ")))}`,
    };
  });
}

