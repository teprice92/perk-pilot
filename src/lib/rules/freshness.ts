import type { VerificationStatus } from "@/lib/domain/types";

/** Verified rules go stale after this many days and should be re-checked. */
export const STALE_AFTER_DAYS = 90;

export type Freshness = "fresh" | "stale" | "never";

export function verificationFreshness(status: VerificationStatus, lastVerified: string | null | undefined, today: string): Freshness {
  if (status !== "verified" || !lastVerified) return "never";
  const age = (Date.parse(today) - Date.parse(lastVerified)) / 86_400_000;
  return age > STALE_AFTER_DAYS ? "stale" : "fresh";
}
