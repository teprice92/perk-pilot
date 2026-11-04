import { cn } from "@/lib/utils";

/**
 * PerkPilot "Route P" mark: the P drawn as a flight route — a dotted takeoff
 * trail becomes the stem, the line loops into the bowl and lands on a gold point.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("size-8", className)} aria-hidden>
      <rect width="100" height="100" rx="24" fill="#0b1426" />
      <path d="M32 82V64" fill="none" stroke="#f0dfb8" strokeWidth="7" strokeLinecap="round" strokeDasharray="0.01 11" />
      <path d="M32 60V31a9 9 0 0 1 9-9h10a17 17 0 0 1 0 34h-5" fill="none" stroke="#f0dfb8" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="42" cy="56" r="6.5" fill="#c9a35e" />
    </svg>
  );
}

/** One-color Route P glyph (no tile), drawn in currentColor — for watermarks and monochrome uses. */
export function RouteGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M32 82V64" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray="0.01 11" />
      <path d="M32 60V31a9 9 0 0 1 9-9h10a17 17 0 0 1 0 34h-5" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="42" cy="56" r="6.5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-[1.35rem] leading-none tracking-tight">
        Perk<span className="text-[color:var(--gold)]">Pilot</span>
      </span>
    </span>
  );
}
