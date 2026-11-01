import { optimizeTrip } from "@/lib/optimizer/engine";
import { RulesRepository } from "@/lib/rules/repository";
import { SEED_RULES } from "@/lib/rules/seed";
import { demoHousehold, demoUsage } from "@/lib/demo/household";
const rules = new RulesRepository(SEED_RULES, "2026-11-01");
const dest = process.argv[2] ?? "tokyo";
const t0 = Date.now();
const r = await optimizeTrip({ request: { destinationId: dest, origin: "SFO", departDate: "2027-04-02", returnDate: "2027-04-09", flexibleDays: 1, adults: 2, children: 0 }, household: demoHousehold(), rules, usage: demoUsage() });
console.log("ms", Date.now() - t0, "json KB", Math.round(JSON.stringify(r).length / 1024));
for (const p of Object.values(r.plans)) {
  console.log("\n==", p.title, "cash", p.totals.cashCents/100, "retail", p.totals.retailCents/100, "credits", p.totals.creditsCents/100, "perks", p.totals.perksValueCents/100, JSON.stringify(p.totals.pointsByProgram), "conf", p.confidence.score);
  for (const [s, c] of Object.entries(p.components)) console.log(" ", s, c.option.label, c.option.cabin ?? c.option.tier, "cash", c.cashAfterCreditsCents/100, "cpp", c.option.cpp, c.credits.map(x=>x.name+":"+x.cents/100).join(","));
  console.log("  exps", p.experiences.map(e => e.experience.name.slice(0,25) + (e.credits.length? "*":"")).join(" | "));
  p.rationale.forEach(x => console.log("  -", x));
  p.householdSteps.forEach(x => console.log("  >", x));
}
