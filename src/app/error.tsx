"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center" role="alert">
      <h1 className="font-display text-3xl">Something went off course</h1>
      <p className="mt-2 text-fg-muted">This screen hit an unexpected error. Your saved data is safe on this device.</p>
      {error.digest && <p className="mt-2 text-xs text-fg-subtle">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>Go home</Button>
      </div>
    </div>
  );
}
