import type { Card } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Abstract card illustration — deliberately not issuer artwork. */
export function CardArt({ card, holder, role, className }: { card: Card; holder?: string; role?: string; className?: string }) {
  return (
    <div
      className={cn("relative aspect-[1.586] w-full overflow-hidden rounded-2xl p-4 shadow-float", className)}
      style={{ background: `linear-gradient(135deg, ${card.art.from}, ${card.art.to})`, color: card.art.text }}
    >
      <div className="absolute -right-10 -top-10 size-40 rounded-full border border-current opacity-10" />
      <div className="absolute -right-4 -top-4 size-28 rounded-full border border-current opacity-10" />
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{card.issuer}</span>
          <span className="h-6 w-8 rounded-md bg-gradient-to-br from-[#f3e2b3] to-[#c49a4a] opacity-90" />
        </div>
        <div>
          <div className="font-display text-lg leading-tight">{card.name.replace(/®| from American Express/g, "")}</div>
          <div className="mt-1 flex items-center justify-between text-[11px] opacity-75">
            <span>{holder ?? ""}</span>
            <span className="uppercase tracking-wider">{role === "authorized_user" ? "Authorized user" : role ? "Primary" : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
