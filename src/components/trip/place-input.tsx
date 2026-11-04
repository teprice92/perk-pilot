"use client";

import { Loader2, MapPin } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { DESTINATIONS } from "@/lib/providers/demo/catalog";
import { cn } from "@/lib/utils";

export interface PlacePick {
  id: string;
  name: string;
  detail: string;
  airports: string[];
  kind: "catalog" | "place";
  note?: string;
}

function localMatches(q: string): PlacePick[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return DESTINATIONS.filter((d) => d.name.toLowerCase().includes(s) || d.aliases.some((a) => a.startsWith(s)) || d.country.toLowerCase().startsWith(s))
    .slice(0, 5)
    .map((d) => ({ id: d.id, name: d.name, detail: `${d.country} · ${d.tagline}`, airports: d.airports, kind: "catalog" }));
}

/**
 * Type-ahead destination field: catalogue matches appear instantly, then any
 * city in the world (with an airport nearby) from /api/places.
 */
export function PlaceInput({
  text,
  onText,
  onPick,
  id,
  placeholder,
  className,
  inputClassName,
  ariaLabel,
}: {
  text: string;
  onText: (t: string) => void;
  onPick: (p: PlacePick) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<{ q: string; results: PlacePick[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const q = text.trim();
  useEffect(() => {
    if (!open || q.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (res.ok) setRemote({ q, results: ((await res.json()) as { results: PlacePick[] }).results });
      } catch {
        /* offline or aborted — local matches still show */
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  const options = useMemo(() => {
    const local = localMatches(q);
    const fromServer = remote && remote.q === q ? remote.results : [];
    const merged = [...local];
    for (const r of fromServer) if (!merged.some((m) => m.id === r.id)) merged.push(r);
    return merged.slice(0, 8);
  }, [q, remote]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(p: PlacePick) {
    onPick(p);
    setOpen(false);
  }

  const showList = open && q.length >= 1 && (options.length > 0 || loading || q.length >= 2);

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <input
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && options[active]) {
            e.preventDefault();
            choose(options[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={inputClassName}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 min-w-64 overflow-auto rounded-2xl border border-border bg-elevated p-1 shadow-float">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2", i === active && "bg-muted")}
            >
              <MapPin className={cn("mt-0.5 size-4 shrink-0", o.kind === "catalog" ? "text-[color:var(--gold)]" : "text-fg-subtle")} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-fg">{o.name}</span>
                <span className="block truncate text-xs text-fg-subtle">
                  {o.detail}
                  {o.kind === "place" && o.note ? ` · ${o.note}` : ""}
                </span>
              </span>
            </li>
          ))}
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-fg-subtle">
              <Loader2 className="size-3.5 animate-spin" /> Searching everywhere…
            </li>
          )}
          {!loading && options.length === 0 && q.length >= 2 && <li className="px-3 py-2 text-xs text-fg-subtle">No places with an airport nearby match “{q}”.</li>}
        </ul>
      )}
    </div>
  );
}
