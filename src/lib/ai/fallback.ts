import type { Cabin, TravelStyle } from "@/lib/domain/types";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import { detectDestinationInText, DESTINATIONS } from "@/lib/providers/demo/catalog";
import { runTool, summarizeResult, type ToolContext } from "./tools";

/**
 * Deterministic concierge used when no LLM is configured (or it fails).
 * Parses intent with simple rules, calls the same tools, and writes a templated
 * answer — so the feature works end-to-end in demo mode without inventing data.
 */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SEASONS: Record<string, number> = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };

export function parseIntent(text: string, today: string) {
  const t = text.toLowerCase();
  const dest = detectDestinationInText(t);
  const nightsMatch = t.match(/(\d+)\s*(?:night|day)/);
  const weekMatch = t.match(/(\d+|a|one|two)\s*week/);
  let nights = nightsMatch ? Number(nightsMatch[1]) - (t.includes("day") && !t.includes("night") ? 1 : 0) : weekMatch ? (["a", "one"].includes(weekMatch[1]!) ? 7 : weekMatch[1] === "two" ? 14 : Number(weekMatch[1]) * 7) : 7;
  nights = Math.max(2, Math.min(21, nights || 7));
  const [ty, tm] = today.split("-").map(Number) as [number, number];
  let month: number | null = null;
  MONTHS.forEach((m, i) => {
    if (t.includes(m)) month = i + 1;
  });
  for (const [s, m] of Object.entries(SEASONS)) if (t.includes(s)) month = s === "spring" ? 4 : m;
  const targetMonth: number = month ?? ((tm + 2 - 1) % 12) + 1;
  let year = ty + (targetMonth <= tm ? 1 : 0);
  if (t.includes("next year")) year = ty + 1;
  const depart = `${year}-${String(targetMonth).padStart(2, "0")}-${t.includes("spring") ? "05" : "10"}`;
  const ret = new Date(`${depart}T12:00:00Z`);
  ret.setUTCDate(ret.getUTCDate() + nights);
  const styles: TravelStyle[] = [];
  if (/romantic|honeymoon|anniversary|couple/.test(t)) styles.push("romantic");
  if (/food|eat|restaurant|dining/.test(t)) styles.push("food");
  if (/museum|culture|history|temple/.test(t)) styles.push("culture");
  if (/hike|adventure|snorkel|outdoor/.test(t)) styles.push("adventure");
  if (/spa|wellness|relax/.test(t)) styles.push("wellness");
  if (/luxury|5-star|five star/.test(t)) styles.push("luxury");
  let cabin: Cabin | undefined;
  if (/business class|lie-flat|lie flat|business/.test(t)) cabin = "business";
  else if (/first class/.test(t)) cabin = "first";
  else if (/economy|cheap/.test(t)) cabin = "economy";
  return { dest, depart, returnDate: ret.toISOString().slice(0, 10), nights, styles, cabin, wantsChaseVsAmex: /chase|amex|which card|should we use/.test(t), wantsHotel: /hotel|resort|stay/.test(t), wantsRemaining: /remaining|left over|leftover|before our trip|best use/.test(t), wantsBenefits: /benefit|credit|perk|lounge/.test(t) };
}

export async function fallbackConcierge(text: string, ctx: ToolContext): Promise<string> {
  const intent = parseIntent(text, ctx.today);
  const lines: string[] = [];
  lines.push("_Running in deterministic mode (no AI model configured) — answers come straight from PerkPilot's calculators and rules database._\n");

  if (!intent.dest) {
    if (intent.wantsRemaining || intent.wantsBenefits) {
      const summary = (await runTool("get_household_summary", {}, ctx)) as { creditsRemaining: Array<{ benefit: string; holder: string; remaining: string; periodEnds: string; enrolled: boolean }> };
      lines.push("**Credits you still have this period:**");
      for (const c of summary.creditsRemaining.slice(0, 8)) lines.push(`- ${c.benefit} (${c.holder}): ${c.remaining} until ${c.periodEnds}${c.enrolled ? "" : " — enrollment not confirmed"}`);
      lines.push("\nOnly use credits on purchases you'd make anyway. Tell me a destination and dates and I'll show where they fit into a trip.");
      return lines.join("\n");
    }
    lines.push("Tell me where you'd like to go and roughly when. I have data for: " + DESTINATIONS.map((d) => d.name).join(", ") + ".");
    return lines.join("\n");
  }

  const res = (await runTool(
    "optimize_trip",
    { destinationId: intent.dest.id, departDate: intent.depart, returnDate: intent.returnDate, adults: 2, children: 0, cabin: intent.cabin, styles: intent.styles.length ? intent.styles : undefined, flexibleDays: 1 },
    ctx,
  )) as ReturnType<typeof summarizeResult>;
  const r = ctx.results[ctx.results.length - 1]!;
  const b = r.plans.balanced;
  lines.push(`Here's what I found for **${r.destination.name}**, ${res.dates}, for ${r.party} travelers (demo estimates):\n`);
  for (const key of ["balanced", "savings", "luxury"] as const) {
    const p = res.plans[key] as { title: string; cashOutOfPocket: string; points: string[]; outbound: string; hotel: string };
    lines.push(`**${p.title}** — ${p.cashOutOfPocket} cash${p.points.length ? ` + ${p.points.join(" + ")}` : ""}`);
    lines.push(`- ✈ ${p.outbound}`);
    lines.push(`- ⌂ ${p.hotel}`);
  }
  lines.push("\n**Why Balanced Value:**");
  for (const x of b.rationale) lines.push(`- ${x}`);
  if (intent.wantsChaseVsAmex) {
    const amex = b.totals.pointsByProgram["amex-mr"] ?? 0;
    const chase = b.totals.pointsByProgram["chase-ur"] ?? 0;
    lines.push(`\n**Chase or Amex?** The balanced plan uses ${amex ? `${formatPoints(amex)} Amex MR` : "no Amex MR"} and ${chase ? `${formatPoints(chase)} Chase UR` : "no Chase UR"}. The engine picks each component by realized value against your baselines, so the answer can differ for flights vs. hotels.`);
  }
  if (b.transfers.length) lines.push(`\n⚠ This plan needs ${b.transfers.length} point transfer(s). Confirm award space first — transfers can't be undone.`);
  lines.push(`\nOpen the plan below to compare all three strategies side by side. Estimated cash savings: ${formatUSD(b.totals.estimatedSavingsCents)} (not guaranteed).`);
  return lines.join("\n");
}
