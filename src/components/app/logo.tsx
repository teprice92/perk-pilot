import { cn } from "@/lib/utils";

/** Original PerkPilot mark: a compass star crossed by a flight path. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="pp-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0dfb8" />
          <stop offset="1" stopColor="#b8924a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0b1426" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#e9dcc2" strokeOpacity=".22" />
      <path d="M16 4.5 18.4 13.6 27.5 16 18.4 18.4 16 27.5 13.6 18.4 4.5 16 13.6 13.6Z" fill="url(#pp-star)" />
      <path d="M16 4.5 18.4 13.6 16 16Z" fill="#fff" opacity=".55" />
      <path d="M6.5 23.5C11.5 19 19.5 12.5 25.8 8.4" stroke="#5fb3ae" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeDasharray="0.1 3.2" />
      <path d="m25.8 8.4-3.3.6 1.4 1.9Z" fill="#5fb3ae" />
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
