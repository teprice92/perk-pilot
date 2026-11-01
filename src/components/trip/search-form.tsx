"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Loader2, MapPin, Minus, PlaneTakeoff, Plus, Route, Sparkles, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import type { Cabin, TravelStyle, TripStop } from "@/lib/domain/types";
import { useOnline } from "@/lib/hooks/use-online";
import { AIRPORTS, DESTINATIONS, findDestination } from "@/lib/providers/demo/catalog";
import type { OptimizationResult } from "@/lib/optimizer/types";
import { useApp } from "@/lib/store/app-store";
import { addDaysISO, cn, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const STYLES: Array<{ id: TravelStyle; label: string }> = [
  { id: "romantic", label: "Romantic" },
  { id: "food", label: "Food" },
  { id: "culture", label: "Culture" },
  { id: "adventure", label: "Adventure" },
  { id: "wellness", label: "Wellness" },
  { id: "nightlife", label: "Nightlife" },
  { id: "nature", label: "Nature" },
  { id: "family", label: "Family" },
];

const PROGRESS = ["Searching flights across nearby airports…", "Comparing award charts & transfer ratios…", "Matching card benefits and credits…", "Building your three strategies…"];

export interface SearchPrefill {
  destination?: string;
  departDate?: string;
  returnDate?: string;
  styles?: TravelStyle[];
  cabin?: Cabin;
}

export function SearchForm({ prefill, compact }: { prefill?: SearchPrefill; compact?: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const household = useApp((s) => s.household);
  const usage = useApp((s) => s.usage);
  const overrides = useApp((s) => s.overrides);
  const addTrip = useApp((s) => s.addTrip);
  const listId = useId();

  const defaultDepart = addDaysISO(todayISO(), 60);
  const [destination, setDestination] = useState(prefill?.destination ?? "");
  const [origin, setOrigin] = useState(household.homeAirport);
  const [departDate, setDepartDate] = useState(prefill?.departDate ?? defaultDepart);
  const [returnDate, setReturnDate] = useState(prefill?.returnDate ?? addDaysISO(defaultDepart, 7));
  const [flex, setFlex] = useState<"0" | "1" | "2" | "3">("0");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [styles, setStyles] = useState<TravelStyle[]>(prefill?.styles ?? household.preferences.styles);
  const [cabin, setCabin] = useState<Cabin>(prefill?.cabin ?? household.preferences.cabin);
  const [showMore, setShowMore] = useState(false);
  const [multi, setMulti] = useState(false);
  const [stops, setStops] = useState<TripStop[]>([{ destinationId: "tokyo", nights: 4 }, { destinationId: "kyoto", nights: 3 }]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill?.destination) setDestination(prefill.destination);
  }, [prefill?.destination]);
  useEffect(() => {
    setOrigin(household.homeAirport);
  }, [household.homeAirport]);

  const match = useMemo(() => findDestination(destination), [destination]);
  const multiNights = stops.reduce((a, x) => a + x.nights, 0);
  const effectiveReturn = multi ? addDaysISO(departDate, multiNights) : returnDate;
  const nights = Math.round((Date.parse(effectiveReturn) - Date.parse(departDate)) / 86_400_000);
  const usAirports = Object.entries(AIRPORTS).filter(([, a]) => a.country === "US");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (multi && new Set(stops.map((x) => x.destinationId)).size !== stops.length) {
      setError("Each city in a multi-city trip should be different.");
      return;
    }
    if (!multi && !match) {
      setError(destination ? `We don't have demo data for “${destination}” yet. Try one of: ${DESTINATIONS.map((d) => d.name).slice(0, 6).join(", ")}…` : "Where would you like to go?");
      return;
    }
    if (nights < 1) {
      setError("Your return date needs to be after departure.");
      return;
    }
    setLoading(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(PROGRESS.length - 1, s + 1)), 650);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: multi
            ? { destinationId: stops[0]!.destinationId, stops, origin, departDate, returnDate: effectiveReturn, flexibleDays: Number(flex), adults, children, cabin, styles }
            : { destinationId: match!.id, origin, departDate, returnDate, flexibleDays: Number(flex), adults, children, cabin, styles },
          household,
          usage,
          overrides,
        }),
      });
      const data = (await res.json()) as OptimizationResult & { error?: string; issues?: Array<{ message: string }> };
      if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "Something went wrong");
      const id = addTrip(data);
      router.push(`/trip?id=${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      toast("Couldn't optimize this trip", msg, "warning");
      setLoading(false);
    } finally {
      clearInterval(timer);
    }
  }

  const Stepper = ({ value, set, min, label }: { value: number; set: (n: number) => void; min: number; label: string }) => (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => set(Math.max(min, value - 1))} className="grid size-8 place-items-center rounded-full border border-border hover:bg-muted disabled:opacity-40" disabled={value <= min}>
        <Minus className="size-3.5" />
      </button>
      <span className="w-5 text-center text-sm font-semibold tabular">{value}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => set(Math.min(8, value + 1))} className="grid size-8 place-items-center rounded-full border border-border hover:bg-muted">
        <Plus className="size-3.5" />
      </button>
    </div>
  );

  return (
    <form onSubmit={submit} className={cn("relative rounded-[1.75rem] border border-border bg-elevated p-3 shadow-float sm:p-4", compact && "shadow-card")} aria-label="Plan a trip">
      <div className="grid gap-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
        {multi ? (
          <div className="rounded-2xl px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle"><Route className="size-3.5" /> Cities in order</p>
            <ol className="mt-1 space-y-1.5">
              {stops.map((st, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-4 text-xs text-fg-subtle tabular">{i + 1}</span>
                  <select aria-label={`City ${i + 1}`} value={st.destinationId} onChange={(e) => setStops(stops.map((x, k) => (k === i ? { ...x, destinationId: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg bg-muted px-2 py-1 text-sm font-medium outline-none">
                    {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <Stepper value={st.nights} set={(n) => setStops(stops.map((x, k) => (k === i ? { ...x, nights: Math.max(1, n) } : x)))} min={1} label={`nights in city ${i + 1}`} />
                  <span className="text-xs text-fg-subtle">n</span>
                  {stops.length > 2 && <button type="button" onClick={() => setStops(stops.filter((_, k) => k !== i))} aria-label={`Remove city ${i + 1}`} className="text-fg-subtle hover:text-danger"><X className="size-4" /></button>}
                </li>
              ))}
            </ol>
            {stops.length < 4 && <button type="button" onClick={() => setStops([...stops, { destinationId: DESTINATIONS.find((d) => !stops.some((x) => x.destinationId === d.id))!.id, nights: 2 }])} className="mt-1.5 text-xs font-medium text-accent hover:underline">+ Add a city</button>}
          </div>
        ) : (
        <div className="rounded-2xl px-3 py-2 transition focus-within:bg-muted hover:bg-muted">
          <label htmlFor="pp-dest" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <MapPin className="size-3.5" /> Where to
          </label>
          <input
            id="pp-dest"
            list={listId}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Tokyo, Hawaii, Paris…"
            className="mt-0.5 w-full bg-transparent text-base font-medium outline-none placeholder:text-fg-subtle"
            autoComplete="off"
            required
          />
          <datalist id={listId}>
            {DESTINATIONS.map((d) => (
              <option key={d.id} value={d.name}>{`${d.country} · ${d.tagline}`}</option>
            ))}
          </datalist>
          <p className="h-4 text-[11px] text-fg-subtle">{match ? `${match.emoji} ${match.name}, ${match.country} · ${match.airports.join(" / ")}` : destination ? "Not in demo catalogue" : ""}</p>
        </div>
        )}
        <div className="rounded-2xl px-3 py-2 transition focus-within:bg-muted hover:bg-muted">
          <label htmlFor="pp-depart" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <CalendarDays className="size-3.5" /> Depart
          </label>
          <input id="pp-depart" type="date" value={departDate} min={todayISO()} onChange={(e) => { setDepartDate(e.target.value); if (e.target.value >= returnDate) setReturnDate(addDaysISO(e.target.value, 7)); }} className="mt-0.5 w-full bg-transparent text-base font-medium outline-none" required />
          <p className="h-4 text-[11px] text-fg-subtle">{flex !== "0" ? `± ${flex} day${flex === "1" ? "" : "s"}` : "Exact dates"}</p>
        </div>
        <div className="rounded-2xl px-3 py-2 transition focus-within:bg-muted hover:bg-muted">
          <label htmlFor="pp-return" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <CalendarDays className="size-3.5" /> Return
          </label>
          <input id="pp-return" type="date" value={effectiveReturn} min={addDaysISO(departDate, 1)} onChange={(e) => setReturnDate(e.target.value)} readOnly={multi} title={multi ? "Set by the nights in each city" : undefined} className="mt-0.5 w-full bg-transparent text-base font-medium outline-none read-only:text-fg-muted" required />
          <p className="h-4 text-[11px] text-fg-subtle">{nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : ""}</p>
        </div>
        <Button type="submit" variant="gold" size="lg" className="h-auto min-h-14 rounded-2xl px-6 lg:min-w-48" disabled={loading || !online}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {online ? "Optimize My Trip" : "Offline"}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3 pt-3">
        <div className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-fg-subtle" />
          <span className="text-fg-muted">Adults</span>
          <Stepper value={adults} set={setAdults} min={1} label="adults" />
          <span className="ml-2 text-fg-muted">Children</span>
          <Stepper value={children} set={setChildren} min={0} label="children" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <PlaneTakeoff className="size-4 text-fg-subtle" />
          <Select aria-label="Departure airport" value={origin} onChange={(e) => setOrigin(e.target.value)} className="h-8 w-auto rounded-full py-0 text-xs">
            {usAirports.map(([code, a]) => (
              <option key={code} value={code}>{code} · {a.city}</option>
            ))}
          </Select>
        </div>
        <Segmented size="sm" value={flex} onChange={setFlex} options={[{ value: "0", label: "Exact" }, { value: "1", label: "±1" }, { value: "2", label: "±2" }, { value: "3", label: "±3 days" }]} />
        <button type="button" onClick={() => setMulti((v) => !v)} aria-pressed={multi} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition", multi ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:border-border-strong")}>
          <Route className="size-3.5" /> Multi-city
        </button>
        <button type="button" onClick={() => setShowMore((v) => !v)} className="text-xs font-medium text-accent hover:underline" aria-expanded={showMore}>
          {showMore ? "Fewer options" : "Style & cabin"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showMore && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-4 px-3 pb-1 pt-4 md:grid-cols-[1fr_auto]">
              <div>
                <Label>Travel style</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STYLES.map((s) => {
                    const on = styles.includes(s.id);
                    return (
                      <button key={s.id} type="button" aria-pressed={on} onClick={() => setStyles(on ? styles.filter((x) => x !== s.id) : [...styles, s.id])} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:border-border-strong")}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Preferred cabin</Label>
                <div className="mt-2">
                  <Segmented size="sm" value={cabin} onChange={setCabin} options={[{ value: "economy", label: "Economy" }, { value: "premium_economy", label: "Premium" }, { value: "business", label: "Business" }, { value: "first", label: "First" }]} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="px-3 pt-3 text-sm text-danger" role="alert">{error}</p>}

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 grid place-items-center rounded-[1.75rem] bg-elevated/95 backdrop-blur" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="relative size-12">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
                <span className="absolute inset-2 grid place-items-center rounded-full bg-accent text-accent-fg"><Sparkles className="size-4" /></span>
              </div>
              <AnimatePresence mode="wait">
                <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-sm font-medium">
                  {PROGRESS[step]}
                </motion.p>
              </AnimatePresence>
              <p className="text-xs text-fg-subtle">Deterministic calculations · demo data</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
