import { WifiOff } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-muted"><WifiOff className="size-6 text-fg-muted" /></div>
      <h1 className="font-display text-3xl">You&apos;re offline</h1>
      <p className="mt-2 text-fg-muted">Your saved trips, itineraries, wallet and benefits are stored on this device and still work. New searches and the AI concierge need a connection.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/trips" className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg">Saved trips</Link>
        <Link href="/wallet" className="rounded-full border border-border px-4 py-2 text-sm font-medium">Wallet</Link>
      </div>
    </div>
  );
}
