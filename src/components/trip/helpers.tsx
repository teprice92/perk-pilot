import type { RulesRepository } from "@/lib/rules/repository";
import type { PaymentOption } from "@/lib/optimizer/types";
import { formatPoints } from "@/lib/calc/money";

export const cardShort = (rules: RulesRepository, id?: string) =>
  id ? (rules.card(id)?.name ?? id).replace(/®|The | Card| from American Express/g, "").trim() : "";

export const pointsText = (rules: RulesRepository, o: PaymentOption) =>
  o.draws.length ? o.draws.map((d) => `${formatPoints(d.points)} ${rules.programName(d.programId)}`).join(" + ") : "—";

export const methodLabel: Record<PaymentOption["method"], string> = {
  cash: "Cash",
  program_booking: "Card hotel program",
  transfer_award: "Transfer & redeem",
  direct_award: "Existing miles/points",
  portal_points: "Portal points",
};

export const cabinLabel = (c?: string) => (c ? c.replace("_", " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "");

export function programColor(programId: string): string {
  if (programId === "amex-mr") return "#7f8a96";
  if (programId === "chase-ur") return "#2a4a7f";
  return "var(--gold)";
}

export const DAY_COLORS = ["#2f7a77", "#b8924a", "#7a3b4f", "#3a6ea5", "#6aa36f", "#c06c3e", "#5a4fcf", "#b83280", "#1d8a8a", "#a26769"];
