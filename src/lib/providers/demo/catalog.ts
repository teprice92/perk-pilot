import type { Destination } from "@/lib/domain/types";

/** Destination & airport catalogue (lightweight — safe to ship to the browser). */

export const DESTINATIONS: Destination[] = [
  { id: "tokyo", name: "Tokyo", country: "Japan", region: "Asia", aliases: ["japan", "tokyo", "shibuya", "ginza"], airports: ["HND", "NRT"], lat: 35.6762, lng: 139.6503, tagline: "Neon nights, quiet shrines", blurb: "A city of a thousand neighborhoods — sushi counters at dawn, gardens at noon, and rooftop bars long after midnight.", palette: ["#1d2b53", "#c0577a", "#f4b7a0"], emoji: "🗼", costIndex: 1.05, bestMonths: [3, 4, 5, 10, 11], neighborhoods: ["Ginza", "Shibuya", "Asakusa", "Roppongi", "Shinjuku"] },
  { id: "kyoto", name: "Kyoto", country: "Japan", region: "Asia", aliases: ["kyoto", "osaka", "kansai"], airports: ["KIX"], lat: 35.0116, lng: 135.7681, tagline: "Temples, tea and lantern-lit lanes", blurb: "Japan's ancient capital: moss gardens, kaiseki dinners and bamboo groves at first light.", palette: ["#2c3a2e", "#b5523b", "#e9c99a"], emoji: "⛩️", costIndex: 1.0, bestMonths: [3, 4, 10, 11], neighborhoods: ["Gion", "Higashiyama", "Arashiyama", "Downtown"] },
  { id: "maui", name: "Maui", country: "United States", region: "Hawaii", aliases: ["hawaii", "maui", "wailea", "kaanapali"], airports: ["OGG"], lat: 20.7984, lng: -156.3319, tagline: "Sunrise above the clouds", blurb: "Volcano summits, the Road to Hana and some of the Pacific's most beautiful beaches.", palette: ["#0e4d64", "#1d8a8a", "#f6c28b"], emoji: "🌺", costIndex: 1.25, bestMonths: [4, 5, 9, 10], neighborhoods: ["Wailea", "Kā'anapali", "Lahaina", "Upcountry"] },
  { id: "las-vegas", name: "Las Vegas", country: "United States", region: "Nevada", aliases: ["vegas", "las vegas", "the strip"], airports: ["LAS"], lat: 36.1147, lng: -115.1728, tagline: "Big shows, bigger suites", blurb: "Residencies, chef-driven dining, desert adventures and resort pools that never sleep.", palette: ["#2a1846", "#b83280", "#f6ad55"], emoji: "🎰", costIndex: 0.95, bestMonths: [3, 4, 5, 10, 11], neighborhoods: ["Center Strip", "South Strip", "Downtown", "Red Rock"] },
  { id: "paris", name: "Paris", country: "France", region: "Europe", aliases: ["paris", "france"], airports: ["CDG", "ORY"], lat: 48.8566, lng: 2.3522, tagline: "Long lunches, golden evenings", blurb: "Museums, bistros and boulevards — the classic romantic escape, done properly.", palette: ["#2b3a55", "#a26769", "#ece2d0"], emoji: "🥐", costIndex: 1.15, bestMonths: [4, 5, 6, 9, 10], neighborhoods: ["Le Marais", "Saint-Germain", "8th Arr.", "Montmartre"] },
  { id: "london", name: "London", country: "United Kingdom", region: "Europe", aliases: ["london", "uk", "england", "united kingdom"], airports: ["LHR", "LGW"], lat: 51.5072, lng: -0.1276, tagline: "Theatre, pubs and royal parks", blurb: "World-class museums (many free), West End shows and a dining scene that rivals any capital.", palette: ["#1f2a44", "#7a3b4f", "#d9c6a5"], emoji: "🎡", costIndex: 1.2, bestMonths: [5, 6, 7, 9], neighborhoods: ["Mayfair", "Covent Garden", "South Bank", "Shoreditch"] },
  { id: "rome", name: "Rome", country: "Italy", region: "Europe", aliases: ["rome", "italy", "roma"], airports: ["FCO"], lat: 41.9028, lng: 12.4964, tagline: "Three thousand years, one espresso", blurb: "Ancient ruins, Renaissance masterpieces and trattorias tucked down cobblestone lanes.", palette: ["#5a2e1f", "#c06c3e", "#f1d6a8"], emoji: "🏛️", costIndex: 1.0, bestMonths: [4, 5, 9, 10], neighborhoods: ["Centro Storico", "Trastevere", "Monti", "Prati"] },
  { id: "lisbon", name: "Lisbon", country: "Portugal", region: "Europe", aliases: ["lisbon", "portugal", "lisboa"], airports: ["LIS"], lat: 38.7223, lng: -9.1393, tagline: "Tiles, trams and Atlantic light", blurb: "Hilltop viewpoints, pastel de nata and fado nights — great value for a European capital.", palette: ["#21455b", "#d98a4e", "#f3e3c3"], emoji: "🚋", costIndex: 0.85, bestMonths: [4, 5, 6, 9, 10], neighborhoods: ["Chiado", "Alfama", "Príncipe Real", "Belém"] },
  { id: "cancun", name: "Cancún & Riviera Maya", country: "Mexico", region: "Caribbean", aliases: ["cancun", "mexico", "tulum", "riviera maya", "playa del carmen"], airports: ["CUN"], lat: 21.1619, lng: -86.8515, tagline: "Turquoise water, cenote swims", blurb: "All-day beach clubs, Mayan ruins and swimming in crystal-clear cenotes.", palette: ["#0b6e7f", "#2bb3b1", "#fbe3b0"], emoji: "🏝️", costIndex: 0.9, bestMonths: [12, 1, 2, 3, 4], neighborhoods: ["Hotel Zone", "Playa del Carmen", "Tulum"] },
  { id: "new-york", name: "New York City", country: "United States", region: "New York", aliases: ["nyc", "new york", "manhattan", "brooklyn"], airports: ["JFK", "EWR", "LGA"], lat: 40.7128, lng: -74.006, tagline: "Broadway, bagels and skyline views", blurb: "Iconic museums, Broadway, legendary restaurants and neighborhoods with distinct personalities.", palette: ["#1a202c", "#4a5568", "#f6e05e"], emoji: "🗽", costIndex: 1.3, bestMonths: [4, 5, 6, 9, 10, 12], neighborhoods: ["Midtown", "SoHo", "West Village", "Brooklyn"] },
  { id: "bali", name: "Bali", country: "Indonesia", region: "Asia", aliases: ["bali", "indonesia", "ubud", "seminyak"], airports: ["DPS"], lat: -8.4095, lng: 115.1889, tagline: "Rice terraces and ocean temples", blurb: "Jungle villas in Ubud, sunset temples and some of the best-value luxury in the world.", palette: ["#1f4d3a", "#6aa36f", "#f5d58b"], emoji: "🌴", costIndex: 0.6, bestMonths: [5, 6, 7, 8, 9], neighborhoods: ["Ubud", "Seminyak", "Uluwatu", "Nusa Dua"] },
  { id: "reykjavik", name: "Reykjavík & South Iceland", country: "Iceland", region: "Europe", aliases: ["iceland", "reykjavik", "northern lights"], airports: ["KEF"], lat: 64.1466, lng: -21.9426, tagline: "Glaciers, lagoons and auroras", blurb: "Geothermal spas, waterfalls and — with luck — the northern lights dancing overhead.", palette: ["#14213d", "#3a6ea5", "#c7e8f3"], emoji: "🌌", costIndex: 1.3, bestMonths: [2, 3, 6, 7, 8, 9], neighborhoods: ["Downtown", "Golden Circle", "South Coast"] },
];

/* Airports */

export const AIRPORTS: Record<string, { city: string; lat: number; lng: number; country: string }> = {
  SFO: { city: "San Francisco", lat: 37.6213, lng: -122.379, country: "US" },
  LAX: { city: "Los Angeles", lat: 33.9416, lng: -118.4085, country: "US" },
  SEA: { city: "Seattle", lat: 47.4502, lng: -122.3088, country: "US" },
  PDX: { city: "Portland", lat: 45.5898, lng: -122.5951, country: "US" },
  SAN: { city: "San Diego", lat: 32.7338, lng: -117.1933, country: "US" },
  JFK: { city: "New York JFK", lat: 40.6413, lng: -73.7781, country: "US" },
  EWR: { city: "Newark", lat: 40.6895, lng: -74.1745, country: "US" },
  LGA: { city: "New York LaGuardia", lat: 40.7769, lng: -73.874, country: "US" },
  BOS: { city: "Boston", lat: 42.3656, lng: -71.0096, country: "US" },
  ORD: { city: "Chicago", lat: 41.9742, lng: -87.9073, country: "US" },
  DFW: { city: "Dallas–Fort Worth", lat: 32.8998, lng: -97.0403, country: "US" },
  IAH: { city: "Houston", lat: 29.9902, lng: -95.3368, country: "US" },
  AUS: { city: "Austin", lat: 30.1975, lng: -97.6664, country: "US" },
  ATL: { city: "Atlanta", lat: 33.6407, lng: -84.4277, country: "US" },
  MIA: { city: "Miami", lat: 25.7959, lng: -80.287, country: "US" },
  DEN: { city: "Denver", lat: 39.8561, lng: -104.6737, country: "US" },
  PHX: { city: "Phoenix", lat: 33.4342, lng: -112.0116, country: "US" },
  LAS: { city: "Las Vegas", lat: 36.084, lng: -115.1537, country: "US" },
  IAD: { city: "Washington Dulles", lat: 38.9531, lng: -77.4565, country: "US" },
  DCA: { city: "Washington National", lat: 38.8512, lng: -77.0402, country: "US" },
  PHL: { city: "Philadelphia", lat: 39.8744, lng: -75.2424, country: "US" },
  MSP: { city: "Minneapolis", lat: 44.8848, lng: -93.2223, country: "US" },
  DTW: { city: "Detroit", lat: 42.2162, lng: -83.3554, country: "US" },
  CLT: { city: "Charlotte", lat: 35.2144, lng: -80.9473, country: "US" },
  SLC: { city: "Salt Lake City", lat: 40.7899, lng: -111.9791, country: "US" },
  HNL: { city: "Honolulu", lat: 21.3187, lng: -157.9225, country: "US" },
  OGG: { city: "Kahului, Maui", lat: 20.8986, lng: -156.4305, country: "US" },
  HND: { city: "Tokyo Haneda", lat: 35.5494, lng: 139.7798, country: "JP" },
  NRT: { city: "Tokyo Narita", lat: 35.772, lng: 140.3929, country: "JP" },
  KIX: { city: "Osaka Kansai", lat: 34.4347, lng: 135.244, country: "JP" },
  CDG: { city: "Paris Charles de Gaulle", lat: 49.0097, lng: 2.5479, country: "FR" },
  ORY: { city: "Paris Orly", lat: 48.7262, lng: 2.3652, country: "FR" },
  LHR: { city: "London Heathrow", lat: 51.47, lng: -0.4543, country: "GB" },
  LGW: { city: "London Gatwick", lat: 51.1537, lng: -0.1821, country: "GB" },
  FCO: { city: "Rome Fiumicino", lat: 41.8003, lng: 12.2389, country: "IT" },
  LIS: { city: "Lisbon", lat: 38.7742, lng: -9.1342, country: "PT" },
  CUN: { city: "Cancún", lat: 21.0365, lng: -86.877, country: "MX" },
  DPS: { city: "Bali Denpasar", lat: -8.7482, lng: 115.1672, country: "ID" },
  KEF: { city: "Reykjavík Keflavík", lat: 63.985, lng: -22.6056, country: "IS" },
};


export function destinationById(id: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}

export function findDestination(query: string): Destination | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (
    DESTINATIONS.find((d) => d.id === q) ??
    DESTINATIONS.find((d) => d.name.toLowerCase() === q) ??
    DESTINATIONS.find((d) => d.aliases.some((a) => a === q)) ??
    DESTINATIONS.find((d) => d.aliases.some((a) => q.includes(a) || a.includes(q))) ??
    DESTINATIONS.find((d) => d.name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q))
  );
}

/** Detect a known destination mentioned anywhere in free text. */
export function detectDestinationInText(text: string): Destination | undefined {
  const t = ` ${text.toLowerCase()} `;
  for (const d of DESTINATIONS) {
    if (t.includes(` ${d.name.toLowerCase()}`)) return d;
  }
  for (const d of DESTINATIONS) {
    if (d.aliases.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))) return d;
  }
  return undefined;
}
