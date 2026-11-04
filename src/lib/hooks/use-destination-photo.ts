"use client";

import { apiFetch } from "@/lib/api-client";
import { useEffect, useState } from "react";
import type { ImageResult } from "@/lib/providers/types";

const cache = new Map<string, ImageResult | null>();

/** Licensed destination photo (Unsplash) when the server is configured; otherwise null. */
export function useDestinationPhoto(destinationId: string): ImageResult | null {
  const [photo, setPhoto] = useState<ImageResult | null>(cache.get(destinationId) ?? null);
  useEffect(() => {
    if (cache.has(destinationId)) {
      setPhoto(cache.get(destinationId) ?? null);
      return;
    }
    let alive = true;
    apiFetch(`/api/images?destination=${encodeURIComponent(destinationId)}`)
      .then((r) => (r.status === 200 ? (r.json() as Promise<ImageResult>) : null))
      .then((p) => {
        cache.set(destinationId, p);
        if (alive) setPhoto(p);
      })
      .catch(() => cache.set(destinationId, null));
    return () => {
      alive = false;
    };
  }, [destinationId]);
  return photo;
}
