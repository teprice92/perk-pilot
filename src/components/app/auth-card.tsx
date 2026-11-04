import type { ReactNode } from "react";
import { LogoMark } from "./logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative grid min-h-[calc(100dvh-4rem)] place-items-center overflow-hidden px-4 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_0%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_70%),radial-gradient(50%_40%_at_10%_90%,color-mix(in_oklab,var(--gold)_18%,transparent),transparent_70%)]" />
      <div className="w-full max-w-md rounded-[1.75rem] border border-border bg-elevated p-7 shadow-float">
        <LogoMark className="size-11" />
        <h1 className="font-display mt-5 text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function passkeyErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return "The passkey prompt was cancelled or timed out. Please try again.";
  if (name === "InvalidStateError") return "This device already has a passkey for PerkPilot — try signing in instead.";
  if (name === "NotSupportedError" || name === "SecurityError") return "This browser can't use passkeys here. PerkPilot needs HTTPS (or localhost) and a recent browser.";
  return e instanceof Error ? e.message : "Something went wrong";
}
