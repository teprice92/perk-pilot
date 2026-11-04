"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";
import { AuthCard, passkeyErrorMessage } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";

function safeNext(next: string | null): string {
  // Only same-site relative paths — never an open redirect.
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { authEnabled, user, needsSetup, signup, status, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (status === "ready" && (!authEnabled || user)) router.replace(next);
  }, [status, authEnabled, user, next, router]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const opt = await fetch("/api/auth/login/options", { method: "POST" });
      const { options, error: err } = await opt.json();
      if (!opt.ok) throw new Error(err ?? "Couldn't start sign-in");
      const response = await startAuthentication({ optionsJSON: options });
      const res = await fetch("/api/auth/login/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed");
      await refresh();
      router.replace(next);
    } catch (e) {
      setError(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Welcome back" subtitle="Sign in with the passkey saved on this device (Face ID, Touch ID, Windows Hello or your phone).">
      {needsSetup ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-accent-soft p-4 text-sm text-accent">No owner account exists yet. Create it with the setup code from your server settings.</p>
          <Link href="/signup"><Button variant="primary" className="w-full">Create the owner account</Button></Link>
        </div>
      ) : (
        <>
          <Button variant="primary" size="lg" className="w-full" onClick={signIn} disabled={busy || status === "loading"}>
            {busy ? <Loader2 className="animate-spin" /> : <Fingerprint />} Sign in with a passkey
          </Button>
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
          <p className="mt-6 text-center text-xs text-fg-subtle">
            {signup === "open" ? (
              <>New here? <Link href="/signup" className="font-medium text-accent hover:underline">Create an account</Link></>
            ) : (
              <>New here? PerkPilot is invite-only — ask the account owner for an invite link.</>
            )}
          </p>
        </>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
