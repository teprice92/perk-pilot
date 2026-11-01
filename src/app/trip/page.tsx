"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApp, useTrip } from "@/lib/store/app-store";
import { Skeleton } from "@/components/ui/misc";
import { TripNotFound, TripView } from "@/components/trip/trip-view";

function TripLoading() {
  return (
    <div>
      <Skeleton className="h-64 rounded-none md:h-80" />
      <div className="mx-auto grid max-w-7xl gap-3 px-4 py-8 sm:px-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}
      </div>
    </div>
  );
}

function TripPageInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const hydrated = useApp((s) => s.hydrated);
  const trip = useTrip(id);
  if (!hydrated) return <TripLoading />;
  if (!trip) return <TripNotFound />;
  const tab = params.get("tab");
  return <TripView key={trip.id} trip={trip} initialTab={(["overview", "flights", "hotels", "experiences", "itinerary"] as const).find((t) => t === tab) ?? "overview"} />;
}

export default function TripPage() {
  return (
    <Suspense fallback={<TripLoading />}>
      <TripPageInner />
    </Suspense>
  );
}
