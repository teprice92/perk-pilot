import type { CreditStatus } from "@/lib/wallet";

/** RFC 5545 calendar of credit reset dates (all-day events with a reminder). */
export function creditResetCalendar(statuses: CreditStatus[], travelerName: (id: string) => string, reminderDays: number): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const d = (iso: string) => iso.replace(/-/g, "");
  const next = (iso: string) => {
    const x = new Date(`${iso}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + 1);
    return x.toISOString().slice(0, 10);
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const events = statuses
    .filter((s) => s.remainingCents > 0 && s.periodEnd < "9999" && !["every_4_years", "every_4_5_years"].includes(s.benefit.period))
    .map((s) =>
      [
        "BEGIN:VEVENT",
        `UID:perkpilot-${s.benefit.id}-${s.travelerId}-${s.periodKey}@perkpilot`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d(s.periodEnd)}`,
        `DTEND;VALUE=DATE:${d(next(s.periodEnd))}`,
        `SUMMARY:${esc(`${s.benefit.name} resets (${travelerName(s.travelerId)})`)}`,
        `DESCRIPTION:${esc(`$${(s.remainingCents / 100).toFixed(0)} unused for ${s.periodLabel}. Only use it for purchases you'd make anyway. — PerkPilot`)}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-P${reminderDays}D`,
        `DESCRIPTION:${esc(`${s.benefit.name} resets soon`)}`,
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n"),
    );
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PerkPilot//Credit resets//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}
