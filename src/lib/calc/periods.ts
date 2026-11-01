import type { BenefitPeriod } from "@/lib/domain/types";

export interface PeriodWindow {
  key: string;
  start: string; // inclusive ISO date
  end: string; // inclusive ISO date
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Compute the benefit period that contains `date`.
 * `anniversary` (MM-DD) is required for cardmember-year periods.
 */
export function periodFor(period: BenefitPeriod, date: string, anniversary = "01-01"): PeriodWindow {
  const [y, m] = date.split("-").map(Number) as [number, number];
  switch (period) {
    case "calendar_year":
      return { key: `${y}`, start: iso(y, 1, 1), end: iso(y, 12, 31), label: `${y}` };
    case "semiannual": {
      const h = m <= 6 ? 1 : 2;
      return h === 1
        ? { key: `${y}-H1`, start: iso(y, 1, 1), end: iso(y, 6, 30), label: `Jan–Jun ${y}` }
        : { key: `${y}-H2`, start: iso(y, 7, 1), end: iso(y, 12, 31), label: `Jul–Dec ${y}` };
    }
    case "quarterly": {
      const q = Math.ceil(m / 3);
      const sm = (q - 1) * 3 + 1;
      const em = sm + 2;
      return { key: `${y}-Q${q}`, start: iso(y, sm, 1), end: iso(y, em, lastDay(y, em)), label: `Q${q} ${y}` };
    }
    case "monthly":
      return { key: `${y}-${pad(m)}`, start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)), label: `${y}-${pad(m)}` };
    case "cardmember_year": {
      const [am, ad] = anniversary.split("-").map(Number) as [number, number];
      const annivThisYear = iso(y, am, Math.min(ad, lastDay(y, am)));
      const startYear = date >= annivThisYear ? y : y - 1;
      const start = iso(startYear, am, Math.min(ad, lastDay(startYear, am)));
      const endDate = new Date(Date.UTC(startYear + 1, am - 1, Math.min(ad, lastDay(startYear + 1, am))));
      endDate.setUTCDate(endDate.getUTCDate() - 1);
      const end = endDate.toISOString().slice(0, 10);
      return { key: `CY${startYear}`, start, end, label: `Card year from ${start}` };
    }
    case "every_4_years":
    case "every_4_5_years": {
      const startYear = y - (y % 4);
      return { key: `${startYear}-4Y`, start: iso(startYear, 1, 1), end: iso(startYear + 3, 12, 31), label: `${startYear}–${startYear + 3}` };
    }
    case "per_stay":
    case "ongoing":
    default:
      return { key: "ongoing", start: "1970-01-01", end: "9999-12-31", label: "Ongoing" };
  }
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
