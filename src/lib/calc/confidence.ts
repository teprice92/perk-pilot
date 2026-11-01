import type { DataKind, VerificationStatus } from "@/lib/domain/types";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceInput {
  dataKind: DataKind;
  /** Age of the price/availability data in hours. */
  ageHours?: number;
  ruleStatuses: VerificationStatus[];
  availability?: "unknown" | "estimated" | "confirmed";
}

export interface Confidence {
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
}

/**
 * Recommendation confidence from data freshness, completeness and rule
 * verification. Deliberately conservative: demo data can never be "high".
 */
export function scoreConfidence(input: ConfidenceInput): Confidence {
  const reasons: string[] = [];
  let score =
    input.dataKind === "live" ? 92 : input.dataKind === "cached" ? 72 : 42;
  if (input.dataKind === "demo") reasons.push("Prices are demonstration estimates, not live quotes");
  if (input.dataKind === "cached") reasons.push("Prices come from a cached search");
  if (input.ageHours !== undefined && input.dataKind !== "demo") {
    if (input.ageHours > 24) {
      score -= 15;
      reasons.push("Price data is more than a day old");
    } else if (input.ageHours > 6) {
      score -= 6;
      reasons.push("Price data is several hours old");
    }
  }
  const worst = input.ruleStatuses.reduce((acc, s) => Math.max(acc, rank(s)), 0);
  if (worst >= rank("unverified")) {
    score -= worst === rank("demo") ? 12 : worst === rank("estimated") ? 10 : 6;
    reasons.push("Relies on card rules that have not been recently verified");
  }
  if (input.availability === "unknown") {
    score -= 8;
    reasons.push("Award availability has not been confirmed");
  } else if (input.availability === "estimated") {
    score -= 5;
    reasons.push("Award pricing is estimated");
  }
  score = Math.max(5, Math.min(99, Math.round(score)));
  const level: ConfidenceLevel = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return { score, level, reasons };
}

function rank(s: VerificationStatus): number {
  return { verified: 0, unverified: 1, estimated: 2, demo: 3 }[s];
}

export function combineConfidence(items: Confidence[]): Confidence {
  if (!items.length) return { score: 0, level: "low", reasons: ["No data"] };
  const score = Math.round(Math.min(...items.map((i) => i.score)) * 0.5 + (items.reduce((a, i) => a + i.score, 0) / items.length) * 0.5);
  const reasons = [...new Set(items.flatMap((i) => i.reasons))];
  return { score, level: score >= 75 ? "high" : score >= 50 ? "medium" : "low", reasons };
}
