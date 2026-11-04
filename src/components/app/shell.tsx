"use client";

import { Compass, Luggage, MessageCircleHeart, Moon, Settings, Sparkles, Sun, Ticket, Wallet, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useOnline } from "@/lib/hooks/use-online";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toast";
import { useAuth } from "@/lib/store/auth-store";
import { AuthAndSync } from "./auth-sync";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Plan", icon: Compass },
  { href: "/trips", label: "Trips", icon: Luggage },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/benefits", label: "Benefits", icon: Ticket },
  { href: "/concierge", label: "Concierge", icon: MessageCircleHeart },
];

export function applyTheme(theme: "system" | "light" | "dark") {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("pp-theme", theme);
  } catch {}
}

function ThemeToggle() {
  const theme = useApp((s) => s.settings.theme);
  const update = useApp((s) => s.updateSettings);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, [theme]);
  return (
    <button
      onClick={() => {
        const next = dark ? "light" : "dark";
        update({ theme: next });
        applyTheme(next);
        setDark(!dark);
      }}
      className="grid size-9 place-items-center rounded-full text-fg-muted transition hover:bg-muted hover:text-fg"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

function ThemeSync() {
  const theme = useApp((s) => s.settings.theme);
  const hydrated = useApp((s) => s.hydrated);
  useEffect(() => {
    if (hydrated) applyTheme(theme);
  }, [theme, hydrated]);
  return null;
}

function AccountChip() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Link href="/account" className="ml-1 grid size-9 place-items-center rounded-full bg-navy text-xs font-semibold text-champagne ring-2 ring-[color-mix(in_oklab,var(--gold)_40%,transparent)]" aria-label={`Account: ${user.name}`} title={user.role === "owner" ? `${user.name} · owner` : user.name}>
      {initials || "?"}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const online = useOnline();
  const authPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  if (authPage) {
    return (
      <div className="min-h-dvh">
        <AuthAndSync />
        <header className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
          <Logo />
        </header>
        <main id="main">{children}</main>
        <Toaster />
      </div>
    );
  }
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/trips" && pathname.startsWith("/trip")));
  return (
    <div className="min-h-dvh">
      <ServiceWorker />
      <ThemeSync />
      <AuthAndSync />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-elevated focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="PerkPilot home" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium transition",
                  isActive(n.href) ? "bg-muted text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            {!online && (
              <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--warning)_15%,transparent)] px-3 py-1 text-xs font-medium text-warning" role="status">
                <WifiOff className="size-3.5" /> Offline
              </span>
            )}
            <Link href="/concierge" className="hidden items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1.5 text-xs font-medium text-[color:var(--gold)] sm:inline-flex md:hidden lg:inline-flex">
              <Sparkles className="size-3.5" /> Ask PerkPilot
            </Link>
            <ThemeToggle />
            <Link href="/settings" className="grid size-9 place-items-center rounded-full text-fg-muted transition hover:bg-muted hover:text-fg" aria-label="Settings & integrations">
              <Settings className="size-[18px]" />
            </Link>
            <AccountChip />
          </div>
        </div>
      </header>

      {!online && (
        <div className="border-b border-border bg-[color-mix(in_oklab,var(--warning)_10%,var(--bg))] px-4 py-2 text-center text-xs text-warning" role="status">
          You&apos;re offline. Saved trips, itineraries and your wallet are available; new searches and the AI concierge need a connection.
        </div>
      )}

      <main id="main" className="pb-24 md:pb-12">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[color-mix(in_oklab,var(--bg-elevated)_90%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Primary mobile">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium", isActive(n.href) ? "text-accent" : "text-fg-subtle")}>
              <n.icon className="size-5" />
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      <Toaster />
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-6 pt-8 sm:px-6 md:flex-row md:items-end md:justify-between md:pt-12">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--gold)]">{eyebrow}</p>}
        <h1 className="font-display text-4xl leading-[1.05] md:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
