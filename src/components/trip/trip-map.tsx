"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { stayForDate, type Itinerary } from "@/lib/itinerary";
import { DAY_COLORS } from "./helpers";

const TILE = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "&copy; OpenStreetMap contributors";

const icon = (label: string, color: string) =>
  L.divIcon({ className: "", html: `<div class="pp-marker" style="background:${color}">${label}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

function Fit({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 13);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export function TripMap({ itinerary, day }: { itinerary: Itinerary; day: string }) {
  const days = itinerary.days.map((d, i) => ({ ...d, i })).filter((d) => day === "all" || d.date === day);
  const stays = itinerary.stays?.length ? itinerary.stays : [{ ...itinerary.hotel, slot: "hotel", startDate: "", endDate: "" }];
  const visibleStays = day === "all" ? stays : [stayForDate(itinerary, day)];
  const pts: Array<[number, number]> = visibleStays.map((s) => [s.lat, s.lng]);
  days.forEach((d) => d.items.forEach((it) => it.kind === "experience" && it.lat !== undefined && it.lng !== undefined && pts.push([it.lat, it.lng])));
  return (
    <MapContainer center={pts[0]!} zoom={12} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer url={TILE} attribution={ATTR} />
      <Fit points={pts} />
      {visibleStays.map((s, i) => (
        <Marker key={`${s.name}-${i}`} position={[s.lat, s.lng]} icon={icon("★", "#b8924a")}>
          <Popup>{s.name}</Popup>
        </Marker>
      ))}
      {days.map((d) => {
        const color = DAY_COLORS[d.i % DAY_COLORS.length]!;
        const hotel = stayForDate(itinerary, d.date);
        const stops = d.items.filter((it) => it.kind === "experience" && it.lat !== undefined && it.lng !== undefined);
        const line: Array<[number, number]> = [[hotel.lat, hotel.lng], ...stops.map((s) => [s.lat!, s.lng!] as [number, number])];
        return (
          <div key={d.date}>
            {stops.length > 0 && <Polyline positions={line} pathOptions={{ color, weight: 3, opacity: 0.7, dashArray: "4 6" }} />}
            {stops.map((s, idx) => (
              <Marker key={s.id} position={[s.lat!, s.lng!]} icon={icon(String(idx + 1), color)}>
                <Popup>
                  <strong>Day {d.i + 1} · {s.startTime}</strong>
                  <br />
                  {s.title}
                </Popup>
              </Marker>
            ))}
          </div>
        );
      })}
    </MapContainer>
  );
}
