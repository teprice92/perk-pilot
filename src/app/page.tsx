"use client";

import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, Calculator, Compass, FlaskConical, Layers, ShieldCheck, Sparkles, Ticket, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import { useRules } from "@/lib/hooks/use-rules";
import { DESTINATIONS } from "@/lib/providers/demo/catalog";
import { useApp } from "@/lib/store/app-store";
import { todayISO } from "@/lib/utils";
import { creditStatuses, householdPoints } from "@/lib/wallet";
import { householdTips } from "@/lib/strategies/household";
import { DestinationArt } from "@/components/app/destination-art";
import { SearchForm, type SearchPrefill } from "@/components/trip/search-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";

const fade = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

export default function HomePage() {
  const household = useApp((s) => s.household);
  const usage = useApp((s) => s.usage);
  const hydrated = useApp((s) => s.hydrated);
  const trips = useApp((s) => s.trips);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const startPersonal = useApp((s) => s.startPersonal);
  const rules = useRules();
  const [prefill, setPrefill] = useState<SearchPrefill | undefined>();

  const points = useMemo(() => householdPoints(household, rules), [household, rules]);
  const credits = useMemo(() => creditStatuses(household, usage, rules, todayISO()), [household, usage, rules]);
  const creditsLeft = credits.filter((c) => c.enrolled).reduce((a, c) => a + c.remainingCents, 0);
  const bank = points.list.filter((p) => p.program?.kind === "bank");
  const highlights = useMemo(
    () => householdTips(household, rules, usage, todayISO(), trips.map((t) => ({ name: t.name, departDate: t.result.request.departDate, result: t.result, strategy: t.selectedStrategy }))).filter((t) => t.impact === "high" || t.kind === "bonus").slice(0, 3),
    [household, rules, usage, trips],
  );

  const pick = (name: string) => {
    setPrefill({ destination: name });
    document.getElementById("pp-dest")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => document.getElementById("pp-dest")?.focus(), 400);
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-deep text-[#f1ece1]">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_0%,rgba(61,140,136,0.35),transparent_60%),radial-gradient(60%_50%_at_10%_20%,rgba(184,146,74,0.22),transparent_60%)]" />
        <svg className="absolute -right-24 top-10 hidden h-[520px] w-[520px] opacity-[0.07] md:block" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="0.3" />
          <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="0.3" />
          <path d="M50 2 55 45 98 50 55 55 50 98 45 55 2 50 45 45Z" fill="currentColor" />
        </svg>
        <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-14 sm:px-6 md:pb-36 md:pt-24">
          <motion.p {...fade} transition={{ duration: 0.5 }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-champagne">
            <Compass className="size-3.5" /> Travel smarter. Experience more.
          </motion.p>
          <motion.h1 {...fade} transition={{ duration: 0.6, delay: 0.05 }} className="font-display max-w-4xl text-5xl leading-[0.98] sm:text-6xl md:text-7xl">
            Tell us where you want to go.
            <span className="block bg-gradient-to-r from-[#f0dfb8] via-[#d9bd85] to-[#9fd3cf] bg-clip-text italic text-transparent">We&apos;ll make your points take you further.</span>
          </motion.h1>
          <motion.p {...fade} transition={{ duration: 0.6, delay: 0.12 }} className="mt-6 max-w-2xl text-lg text-[#c9c4b8]">
            PerkPilot compares cash, award flights, transfer partners and card benefits across your household&apos;s Amex Platinum and Sapphire Reserve — then builds three strategies you can actually book.
          </motion.p>
        </div>
      </section>

      {/* Search card overlapping hero */}
      <section className="relative z-10 mx-auto -mt-20 max-w-6xl px-4 sm:px-6 md:-mt-24">
        <motion.div {...fade} transition={{ duration: 0.6, delay: 0.18 }}>
          <SearchForm prefill={prefill} />
        </motion.div>
        {household.mode === "demo" && !settings.dismissedDemoBanner && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_8%,var(--bg-elevated))] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-fg-muted">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <strong className="text-fg">Guest demo mode.</strong> You&apos;re using a sample household and illustrative prices. Nothing here is a live quote.
              </span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => updateSettings({ dismissedDemoBanner: true })}>Keep exploring</Button>
              <Link href="/wallet" onClick={() => startPersonal()}>
                <Button size="sm" variant="primary">Use my own balances</Button>
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Household snapshot */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--gold)]">Your household</p>
            <h2 className="font-display mt-1 text-3xl">{household.name}</h2>
          </div>
          <Link href="/wallet" className="hidden items-center gap-1 text-sm font-medium text-accent hover:underline sm:inline-flex">
            Open wallet <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!hydrated ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)
          ) : (
            <>
              <Stat icon={<Wallet />} label="Points value at your valuations" value={formatUSD(points.totalValueCents)} sub={`${points.list.length} programs across ${household.travelers.length} travelers`} />
              {bank.map((p) => (
                <Stat key={p.programId} icon={<Layers />} label={p.program?.shortName ?? p.programId} value={formatPoints(p.total)} sub={p.holders.map((h) => `${household.travelers.find((t) => t.id === h.travelerId)?.name}: ${formatPoints(h.points, true)}`).join(" · ")} />
              ))}
              <Stat icon={<Ticket />} label="Card credits left this period" value={formatUSD(creditsLeft)} sub={`${credits.filter((c) => c.needsEnrollment).length} need enrollment`} href="/benefits" />
            </>
          )}
        </div>
      </section>

      {hydrated && highlights.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <div className="grid gap-3 md:grid-cols-3">
            {highlights.map((t) => (
              <Link key={t.id} href={t.href ?? "/wallet"} className="rounded-3xl border border-[color-mix(in_oklab,var(--gold)_35%,transparent)] bg-gold-soft/40 p-4 transition hover:border-[color:var(--gold)]">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--gold)]"><Sparkles className="size-3.5" /> {t.kind === "bonus" ? "Transfer bonus" : "Points strategy"}</p>
                <p className="mt-1 text-sm font-medium">{t.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{t.body}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Destinations */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--gold)]">Inspiration</p>
          <h2 className="font-display mt-1 text-3xl">Where your cards shine</h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">Twelve destinations in the demo catalogue, each with modelled flights, Fine Hotels + Resorts and The Edit-style properties, and curated experiences.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {DESTINATIONS.map((d, i) => (
            <motion.button
              key={d.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 4) * 0.05 }}
              onClick={() => pick(d.name)}
              className="group text-left"
            >
              <DestinationArt destination={d} className="aspect-[4/5] rounded-3xl shadow-card transition-transform duration-500 group-hover:-translate-y-1 sm:aspect-[4/3]">
                <div className="flex h-full flex-col justify-end p-4 text-white">
                  <span className="text-[11px] font-medium uppercase tracking-wider opacity-80">{d.country}</span>
                  <span className="font-display text-2xl leading-tight">{d.name}</span>
                  <span className="text-xs opacity-80">{d.tagline}</span>
                </div>
              </DestinationArt>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Recent trips */}
      {trips.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-3xl">Pick up where you left off</h2>
            <Link href="/trips" className="text-sm font-medium text-accent hover:underline">All trips</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {trips.slice(0, 3).map((t) => (
              <Link key={t.id} href={`/trip?id=${t.id}`} className="group flex items-center gap-4 rounded-2xl border border-border bg-elevated p-3 shadow-card transition hover:border-border-strong">
                <DestinationArt destination={t.result.destination} className="size-16 shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-fg-muted">{t.result.plans[t.selectedStrategy].title} · {formatUSD(t.result.plans[t.selectedStrategy].totals.cashCents)} cash</p>
                  {t.saved ? <Badge variant="accent" className="mt-1">Saved</Badge> : <Badge className="mt-1">Draft</Badge>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { icon: <Calculator />, title: "Deterministic math", body: "Cents-per-point, transfer ratios, bonuses and credits are calculated by a tested engine — never guessed by an AI." },
            { icon: <ShieldCheck />, title: "Honest about data", body: "Every price shows whether it is live, cached or a demo estimate. Every card rule shows its verification status and source." },
            { icon: <BadgeCheck />, title: "You stay in control", body: "PerkPilot never transfers points or books anything. It gives you step-by-step instructions and links to verify first." },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl border border-border bg-elevated p-6 shadow-card">
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5">{f.icon}</div>
              <h3 className="font-display text-xl">{f.title}</h3>
              <p className="mt-1.5 text-sm text-fg-muted">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl bg-navy-deep px-6 py-10 text-center text-[#f1ece1]">
          <Sparkles className="size-6 text-champagne" />
          <p className="font-display max-w-2xl text-2xl">“Plan a romantic trip to Japan next spring and maximize our points.”</p>
          <Link href="/concierge?q=Plan%20a%20romantic%20trip%20to%20Japan%20next%20spring%20and%20maximize%20our%20points">
            <Button variant="gold">Ask the AI concierge <ArrowRight /></Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="h-full rounded-3xl border border-border bg-elevated p-5 shadow-card transition hover:border-border-strong">
      <div className="flex items-center gap-2 text-xs font-medium text-fg-muted [&_svg]:size-4 [&_svg]:text-[color:var(--gold)]">
        {icon}
        {label}
      </div>
      <p className="font-display mt-3 text-3xl tabular">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
