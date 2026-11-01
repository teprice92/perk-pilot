import type { Destination } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Generative "postcard" art for a destination, built from its palette. Used
 * when no licensed photograph is configured (see UNSPLASH_ACCESS_KEY).
 */
export function DestinationArt({ destination, className, children, variant = "hills" }: { destination: Pick<Destination, "palette" | "id">; className?: string; children?: React.ReactNode; variant?: "hills" | "waves" }) {
  const [a, b, c] = destination.palette;
  const id = `g-${destination.id}`;
  const wavey = variant === "waves" || ["maui", "cancun", "bali", "lisbon"].includes(destination.id);
  return (
    <div className={cn("grain relative overflow-hidden", className)}>
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="0.65" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
          <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff7e6" stopOpacity="0.95" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="260" fill={`url(#${id}-sky)`} />
        <circle cx="290" cy="150" r="90" fill={`url(#${id}-sun)`} />
        <circle cx="290" cy="150" r="30" fill="#fff4dc" opacity="0.85" />
        {wavey ? (
          <>
            <path d="M0 190 C60 175 120 205 200 188 S330 175 400 190 V260 H0Z" fill={a} opacity="0.55" />
            <path d="M0 210 C80 198 140 222 220 208 S340 200 400 212 V260 H0Z" fill={a} opacity="0.75" />
            <path d="M0 232 C90 222 160 242 240 230 S350 226 400 234 V260 H0Z" fill={a} />
          </>
        ) : (
          <>
            <path d="M0 200 L60 150 L110 185 L170 120 L230 175 L290 135 L350 180 L400 155 V260 H0Z" fill={a} opacity="0.45" />
            <path d="M0 220 L50 190 L120 215 L190 170 L260 210 L330 185 L400 205 V260 H0Z" fill={a} opacity="0.7" />
            <path d="M0 240 C80 228 160 246 240 236 S360 232 400 238 V260 H0Z" fill={a} />
          </>
        )}
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
      <div className="relative h-full">{children}</div>
    </div>
  );
}
