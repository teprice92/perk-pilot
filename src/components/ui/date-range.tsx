"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addDaysISO, cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function addMonths(iso: string, n: number): string {
  const d = new Date(`${monthStart(iso)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
function label(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}

/**
 * Airline-style range picker: tap the departure day, then the return day.
 * With `fixedNights` (multi-city), only the departure is picked and the
 * return follows from the nights in each city.
 */
export function DateRangePicker({
  start,
  end,
  min,
  fixedNights,
  hint,
  onChange,
  className,
}: {
  start: string;
  end: string;
  min: string;
  fixedNights?: number;
  hint?: string;
  onChange: (start: string, end: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(monthStart(start));
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Bring the calendar fully into view (on phones it opens below the fold).
  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() reads the latest props/state via this effect's deps
  }, [open, pendingStart, start, end]);

  function openPicker(which: "start" | "end") {
    setView(monthStart(which === "end" && !fixedNights ? end : start));
    // Tapping "Return" keeps the departure and asks only for the return day.
    setPendingStart(which === "end" && !fixedNights ? start : null);
    setOpen(true);
  }

  function close() {
    // Picked a departure but no return yet: keep the previous trip length.
    if (pendingStart) onChange(pendingStart, addDaysISO(pendingStart, Math.max(1, nightsBetween(start, end))));
    setPendingStart(null);
    setHover(null);
    setOpen(false);
  }

  function pick(day: string) {
    if (fixedNights) {
      onChange(day, addDaysISO(day, fixedNights));
      setOpen(false);
      return;
    }
    if (!pendingStart || day <= pendingStart) {
      setPendingStart(day);
      return;
    }
    onChange(pendingStart, day);
    setPendingStart(null);
    setHover(null);
    setOpen(false);
  }

  // What the calendar highlights right now.
  const selStart = pendingStart ?? start;
  const selEnd = fixedNights ? addDaysISO(selStart, fixedNights) : pendingStart ? (hover && hover > pendingStart ? hover : null) : end;
  const nights = nightsBetween(start, end);
  const canPrev = addMonths(view, -1) >= monthStart(min);

  const field = (which: "start" | "end", title: string, value: string, sub: string) => (
    <button
      type="button"
      onClick={() => openPicker(which)}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        "rounded-2xl px-3 py-2 text-left transition hover:bg-muted",
        open && (which === "start" ? !pendingStart || fixedNights : pendingStart && !fixedNights) && "bg-muted ring-1 ring-accent/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        <CalendarDays className="size-3.5" /> {title}
      </span>
      <span className="mt-0.5 block text-base font-medium">{label(value, { weekday: "short", month: "short", day: "numeric" })}</span>
      <span className="block h-4 text-[11px] text-fg-subtle">{sub}</span>
    </button>
  );

  return (
    <div ref={ref} className={cn("relative grid grid-cols-2 gap-2", className)}>
      {field("start", "Depart", start, hint ?? "")}
      {field("end", "Return", end, fixedNights ? `${nights} night${nights === 1 ? "" : "s"} · set by cities` : `${nights} night${nights === 1 ? "" : "s"}`)}

      {open && (
        <div ref={panel} role="dialog" aria-label="Choose travel dates" className="absolute left-0 right-0 top-full z-30 mt-2 rounded-3xl border border-border bg-elevated p-4 shadow-float sm:left-auto sm:right-auto sm:w-[40rem] sm:max-w-[calc(100vw-2rem)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setView(addMonths(view, -1))} disabled={!canPrev} aria-label="Previous month" className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-sm font-medium text-fg-muted" aria-live="polite">
              {fixedNights ? "Choose your departure day" : pendingStart ? "Now choose your return day" : "Choose your departure day"}
            </p>
            <button type="button" onClick={() => setView(addMonths(view, 1))} aria-label="Next month" className="grid size-8 place-items-center rounded-full hover:bg-muted">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {[0, 1].map((offset) => (
              <Month
                key={offset}
                month={addMonths(view, offset)}
                min={min}
                selStart={selStart}
                selEnd={selEnd}
                onPick={pick}
                onHover={setHover}
                className={offset === 1 ? "hidden sm:block" : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Month({ month, min, selStart, selEnd, onPick, onHover, className }: { month: string; min: string; selStart: string; selEnd: string | null; onPick: (d: string) => void; onHover: (d: string | null) => void; className?: string }) {
  const first = new Date(`${month}T12:00:00Z`);
  const lead = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDaysISO(month, i))];

  return (
    <div className={className}>
      <p className="mb-2 text-center text-sm font-semibold">{label(month, { month: "long", year: "numeric" })}</p>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-fg-subtle">
        {WEEKDAYS.map((w, i) => <span key={i} className="py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover(null)}>
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const disabled = day < min;
          const isStart = day === selStart;
          const isEnd = day === selEnd;
          const inRange = selEnd !== null && day > selStart && day < selEnd;
          return (
            <div key={day} className={cn("py-0.5", inRange && "bg-accent-soft", isStart && selEnd && "rounded-l-full bg-accent-soft", isEnd && "rounded-r-full bg-accent-soft")}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(day)}
                onMouseEnter={() => onHover(day)}
                onFocus={() => onHover(day)}
                aria-label={label(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                aria-pressed={isStart || isEnd}
                className={cn(
                  "mx-auto grid size-9 place-items-center rounded-full text-sm tabular transition",
                  disabled ? "cursor-not-allowed text-fg-subtle/40" : "hover:bg-muted",
                  (isStart || isEnd) && "bg-accent font-semibold text-accent-fg hover:bg-accent",
                )}
              >
                {Number(day.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
