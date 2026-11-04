"use client";

import { apiFetch } from "@/lib/api-client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Bot, Compass, Loader2, RotateCcw, Sparkles, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { formatPoints, formatUSD } from "@/lib/calc/money";
import { useOnline } from "@/lib/hooks/use-online";
import { useRules } from "@/lib/hooks/use-rules";
import type { OptimizationResult } from "@/lib/optimizer/types";
import { useApp, type SavedTrip } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import { DestinationArt } from "@/components/app/destination-art";
import { Markdown } from "@/components/app/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; content: string; trips?: OptimizationResult[]; mode?: string };

const SUGGESTIONS = [
  "Plan a romantic trip to Japan next spring and maximize our points.",
  "We want to go to Hawaii for seven days. Should we use Chase or Amex?",
  "Find a luxury hotel in Las Vegas where we can use our Platinum benefits.",
  "Find the best use of our remaining credits before our trip.",
  "Can we get business class flights to Paris without spending too much cash?",
];

function tripContextText(t: SavedTrip): string {
  const p = t.result.plans[t.selectedStrategy];
  const days = t.itinerary.days.map((d, i) => `Day ${i + 1} (${d.date}): ${d.items.map((x) => `${x.startTime ?? ""} ${x.title}`).join("; ")}`).join("\n");
  return `${t.name} — ${t.result.destination.name}, ${t.result.request.departDate} to ${t.result.request.returnDate}, ${t.result.party} travelers. Strategy: ${p.title} (${formatUSD(p.totals.cashCents)} cash; points ${Object.entries(p.totals.pointsByProgram).map(([k, v]) => `${formatPoints(v)} ${k}`).join(", ") || "none"}).\nItinerary:\n${days}`.slice(0, 5800);
}

function ConciergeInner() {
  const params = useSearchParams();
  const router = useRouter();
  const online = useOnline();
  const rules = useRules();
  const household = useApp((s) => s.household);
  const usage = useApp((s) => s.usage);
  const overrides = useApp((s) => s.overrides);
  const hydrated = useApp((s) => s.hydrated);
  const addTrip = useApp((s) => s.addTrip);
  const trip = useApp((s) => s.trips.find((t) => t.id === params.get("trip")));
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const [aiReason, setAiReason] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);
  const tripContext = useMemo(() => (trip ? tripContextText(trip) : undefined), [trip]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), household, usage, overrides, tripContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The concierge is unavailable");
      setMode(data.mode);
      setAiReason(data.aiReason ?? null);
      setMessages([...next, { role: "assistant", content: data.text, trips: data.trips, mode: data.mode }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `Sorry — ${e instanceof Error ? e.message : "something went wrong"}. Please try again.` }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = params.get("q");
    if (q && hydrated && !sentInitial.current && online) {
      sentInitial.current = true;
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, params, online]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const openPlan = (r: OptimizationResult) => {
    const id = addTrip(r);
    router.push(`/trip?id=${id}`);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 pt-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--gold)]">AI concierge</p>
          <h1 className="font-display text-3xl">Ask PerkPilot</h1>
        </div>
        <div className="flex items-center gap-2">
          {mode && <Badge variant={mode === "llm" ? "accent" : "warning"} title={aiReason === "not_enabled" ? "The account owner hasn't enabled the AI model for your account" : undefined}>{mode === "llm" ? "AI + verified tools" : aiReason === "not_enabled" ? "Free planner mode" : aiReason === "user_limit" ? "Daily AI limit reached" : "Deterministic mode"}</Badge>}
          {messages.length > 0 && <Button size="sm" variant="ghost" onClick={() => setMessages([])}><RotateCcw /> New chat</Button>}
        </div>
      </div>
      {trip && <p className="mb-3 rounded-2xl bg-accent-soft px-4 py-2 text-xs text-accent">Context: <Link href={`/trip?id=${trip.id}`} className="font-medium underline">{trip.name}</Link> — the concierge can see this trip&apos;s plan and itinerary.</p>}

      <div className="flex-1 space-y-5 pb-36" aria-live="polite">
        {messages.length === 0 && (
          <div className="pt-6 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-navy-deep text-champagne"><Compass className="size-6" /></div>
            <p className="font-display text-2xl">Where should your points take you?</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">The concierge understands natural language, but every price, ratio and benefit comes from PerkPilot&apos;s deterministic engine and rules database.</p>
            <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={!online} className="rounded-2xl border border-border bg-elevated p-4 text-sm shadow-card transition hover:border-border-strong disabled:opacity-50">
                  <Sparkles className="mb-2 size-4 text-[color:var(--gold)]" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-navy-deep text-champagne"><Bot className="size-4" /></span>}
              <div className={cn("max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed", m.role === "user" ? "bg-fg text-bg" : "border border-border bg-elevated shadow-card")}>
                {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
                {m.trips?.map((r) => (
                  <button key={r.id} onClick={() => openPlan(r)} className="mt-3 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border bg-bg text-left transition hover:border-accent">
                    <DestinationArt destination={r.destination} className="h-16 w-20 shrink-0" />
                    <span className="min-w-0 flex-1 py-2">
                      <span className="block font-medium">{r.destination.name} · {r.nights} nights</span>
                      <span className="block truncate text-xs text-fg-muted">Balanced: {formatUSD(r.plans.balanced.totals.cashCents)} cash · {Object.entries(r.plans.balanced.totals.pointsByProgram).map(([k, v]) => `${formatPoints(v, true)} ${rules.programName(k)}`).join(" + ") || "no points"}</span>
                    </span>
                    <span className="pr-4 text-xs font-medium text-accent">Open plan →</span>
                  </button>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <div className="flex items-center gap-3 text-sm text-fg-muted">
            <span className="grid size-8 place-items-center rounded-full bg-navy-deep text-champagne"><Loader2 className="size-4 animate-spin" /></span>
            Checking balances, rules and running the optimizer…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="fixed inset-x-0 bottom-16 z-30 px-4 pb-3 md:bottom-0 md:pb-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-border bg-elevated p-2 shadow-float">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            rows={1}
            maxLength={4000}
            placeholder={online ? "Ask about a trip, your points or your card benefits…" : "You're offline — the concierge needs a connection"}
            disabled={!online}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-fg-subtle"
            aria-label="Message the concierge"
          />
          <Button type="submit" size="icon" variant="accent" disabled={!input.trim() || loading || !online} aria-label="Send" className="size-11">
            {online ? <ArrowUp /> : <WifiOff />}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function ConciergePage() {
  return (
    <Suspense fallback={null}>
      <ConciergeInner />
    </Suspense>
  );
}
