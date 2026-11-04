"use client";

import { apiFetch } from "@/lib/api-client";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, MapPin, Minus, PlaneTakeoff, Plus, Route, Sparkles, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import type { Cabin, TravelStyle, TripStop } from "@/lib/domain/types";
import { useOnline } from "@/lib/hooks/use-online";
import { AIRPORTS, DESTINATIONS, destinationById, findDestination } from "@/lib/providers/demo/catalog";
import { PlaceInput, type PlacePick } from "@/components/trip/place-input";
import type { OptimizationResult } from "@/lib/optimizer/types";
import { useApp } from "@/lib/store/app-store";
import { addDaysISO, cn, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range";
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

  const tomorrow = addDaysISO(todayISO(), 1);
  const defaultDepart = addDaysISO(todayISO(), 60);
  const [destination, setDestination] = useState(prefill?.destination ?? "");
  const [picked, setPicked] = useState<PlacePick | null>(null);
  const [stopDrafts, setStopDrafts] = useState<Record<number, string>>({});
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
    if (prefill?.destination) {
      setDestination(prefill.destination);
      setPicked(null);
    }
  }, [prefill?.destination]);
  useEffect(() => {
    setOrigin(household.homeAirport);
    setOriginText(household.homeAirport);
  }, [household.homeAirport]);

  function chooseOrigin(text: string) {
    setOriginText(text);
    const code = text.trim().slice(0, 3).toUpperCase();
    if (AIRPORTS[code]) return setOrigin(code);
    const byCity = homeAirports.find(([, a]) => a.city.toLowerCase() === text.trim().toLowerCase());
    setOrigin(byCity ? byCity[0] : code);
  }

  const match = useMemo(() => (picked ? destinationById(picked.id) : findDestination(destination)), [picked, destination]);
  const multiNights = stops.reduce((a, x) => a + x.nights, 0);
  const effectiveReturn = multi ? addDaysISO(departDate, multiNights) : returnDate;
  const nights = Math.round((Date.parse(effectiveReturn) - Date.parse(departDate)) / 86_400_000);
  const homeAirports = useMemo(() => Object.entries(AIRPORTS).filter(([, a]) => ["US", "CA"].includes(a.country)).sort((a, b) => a[1].city.localeCompare(b[1].city)), []);
  const [originText, setOriginText] = useState(household.homeAirport);
  const originValid = Boolean(AIRPORTS[origin]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const draft = Object.keys(stopDrafts)[0];
    if (multi && draft !== undefined) {
      setError(`Pick city ${Number(draft) + 1} from the suggestions as you type.`);
      return;
    }
    if (multi && new Set(stops.map((x) => x.destinationId)).size !== stops.length) {
      setError("Each city in a multi-city trip should be different.");
      return;
    }
    if (!multi && !match) {
      setError(destination ? `Pick “${destination}” from the suggestions as you type — any city with an airport nearby works.` : "Where would you like to go?");
      return;
    }
    if (!originValid) {
      setError(`Choose a departure airport from the list (we don't have ${originText || "that one"} yet).`);
      return;
    }
    if (departDate < tomorrow) {
      setError("Choose a departure date from tomorrow onwards.");
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
      const res = await apiFetch("/api/optimize", {
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

  const Stepper = ({ value, set, min, max = 8, label }: { value: number; set: (n: number) => void; min: number; max?: number; label: string }) => (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => set(Math.max(min, value - 1))} className="grid size-8 place-items-center rounded-full border border-border hover:bg-muted disabled:opacity-40" disabled={value <= min}>
        <Minus className="size-3.5" />
      </button>
      <span className="w-5 text-center text-sm font-semibold tabular">{value}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} className="grid size-8 place-items-center rounded-full border border-border hover:bg-muted disabled:opacity-40">
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
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="w-4 text-xs text-fg-subtle tabular">{i + 1}</span>
                  <PlaceInput
                    ariaLabel={`City ${i + 1}`}
                    text={stopDrafts[i] ?? destinationById(st.destinationId)?.name ?? ""}
                    onText={(t) => setStopDrafts({ ...stopDrafts, [i]: t })}
                    onPick={(p) => {
                      setStops(stops.map((x, k) => (k === i ? { ...x, destinationId: p.id } : x)));
                      const rest = { ...stopDrafts };
                      delete rest[i];
                      setStopDrafts(rest);
                    }}
                    className="min-w-36 flex-1"
                    inputClassName={cn("w-full rounded-lg bg-muted px-2 py-1 text-sm font-medium outline-none", stopDrafts[i] !== undefined && "ring-1 ring-warning/60")}
                  />
                  <div className="flex items-center gap-2">
                    <Stepper value={st.nights} set={(n) => setStops(stops.map((x, k) => (k === i ? { ...x, nights: Math.max(1, n) } : x)))} min={1} max={30} label={`nights in city ${i + 1}`} />
                    <span className="w-12 whitespace-nowrap text-xs text-fg-subtle">{st.nights === 1 ? "night" : "nights"}</span>
                    {stops.length > 2 && <button type="button" onClick={() => { setStops(stops.filter((_, k) => k !== i)); setStopDrafts({}); }} aria-label={`Remove city ${i + 1}`} className="text-fg-subtle hover:text-danger"><X className="size-4" /></button>}
                  </div>
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
          <PlaceInput
            id="pp-dest"
            text={destination}
            onText={(t) => {
              setDestination(t);
              setPicked(null);
            }}
            onPick={(p) => {
              setPicked(p);
              setDestination(p.name);
            }}
            placeholder="Any city — Tokyo, Porto, Tulum…"
            inputClassName="mt-0.5 w-full bg-transparent text-base font-medium outline-none placeholder:text-fg-subtle"
          />
          <p className="h-4 text-[11px] text-fg-subtle">{match ? `${match.emoji} ${match.name}, ${match.country} · ${match.airports.join(" / ")}` : destination ? "Choose from the suggestions" : ""}</p>
        </div>
        )}
        <DateRangePicker
          className="lg:col-span-2"
          start={departDate}
          end={effectiveReturn}
          min={tomorrow}
          fixedNights={multi ? multiNights : undefined}
          hint={flex !== "0" ? `± ${flex} day${flex === "1" ? "" : "s"}` : "Exact dates"}
          onChange={(start, end) => {
            setDepartDate(start);
            if (!multi) setReturnDate(end);
          }}
        />
        <Button type="submit" variant="gold" size="lg" className="h-auto min-h-14 rounded-2xl px-6 lg:min-w-48" disabled={loading || !online}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {online ? "Optimize My Trip" : "Offline"}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Users className="size-4 text-fg-subtle" />
          <span className="inline-flex items-center gap-2"><span className="text-fg-muted">Adults</span><Stepper value={adults} set={setAdults} min={1} label="adults" /></span>
          <span className="inline-flex items-center gap-2 sm:ml-2"><span className="text-fg-muted">Children</span><Stepper value={children} set={setChildren} min={0} label="children" /></span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <PlaneTakeoff className="size-4 text-fg-subtle" />
          <input
            aria-label="Departure airport"
            list={`${listId}-airports`}
            value={originText}
            onChange={(e) => chooseOrigin(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => originValid && setOriginText(origin)}
            placeholder="From (city or code)"
            autoComplete="off"
            className={cn("h-8 w-40 rounded-full border bg-transparent px-3 text-xs font-medium outline-none focus:border-accent", originValid ? "border-border" : "border-danger")}
          />
          <datalist id={`${listId}-airports`}>
            {homeAirports.map(([code, a]) => (
              <option key={code} value={code}>{a.city}</option>
            ))}
          </datalist>
          {originValid && <span className="hidden text-xs text-fg-subtle sm:inline">{AIRPORTS[origin]!.city}</span>}
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
