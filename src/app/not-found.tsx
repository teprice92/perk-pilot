import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--gold)]">404</p>
      <h1 className="font-display mt-2 text-4xl">This route isn&apos;t on the map</h1>
      <Link href="/" className="mt-6 inline-block rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg">Back to planning</Link>
    </div>
  );
}
