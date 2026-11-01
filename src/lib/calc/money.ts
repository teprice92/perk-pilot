/** Money helpers — all amounts are integer cents. */

export function formatUSD(cents: number, opts: { compact?: boolean; showCents?: boolean } = {}): string {
  const dollars = cents / 100;
  if (opts.compact && Math.abs(dollars) >= 10_000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(dollars);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.showCents ? 2 : 0,
    maximumFractionDigits: opts.showCents ? 2 : 0,
  }).format(dollars);
}

export function formatPoints(points: number, compact = false): string {
  if (compact && points >= 10_000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(points);
  }
  return new Intl.NumberFormat("en-US").format(Math.round(points));
}

export function formatCpp(cpp: number | null | undefined): string {
  if (cpp === null || cpp === undefined || !Number.isFinite(cpp)) return "—";
  return `${cpp.toFixed(2)}¢`;
}

export function sumCents(values: number[]): number {
  return values.reduce((a, b) => a + Math.round(b), 0);
}

export function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}
