"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";
import { AuthCard, passkeyErrorMessage } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

function SignupInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { authEnabled, user, needsSetup, signup, status, refresh } = useAuth();
  const invite = params.get("invite") ?? "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "ready" && (!authEnabled || user)) router.replace("/");
  }, [status, authEnabled, user, router]);

  const canSignUp = needsSetup || Boolean(invite) || signup === "open";

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const opt = await fetch("/api/auth/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, ...(needsSetup ? { setupCode } : {}), ...(invite ? { invite } : {}) }),
      });
      const optData = await opt.json();
      if (!opt.ok) throw new Error(optData.error ?? "Couldn't start sign-up");
      const response = await startRegistration({ optionsJSON: optData.options });
      const res = await fetch("/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign-up failed");
      await refresh();
      router.replace(needsSetup ? "/admin" : "/");
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (status === "ready" && !canSignUp) {
    return (
      <AuthCard title="Invite needed" subtitle="PerkPilot is invite-only. Ask the account owner to send you an invite link.">
        <Link href="/login"><Button variant="outline" className="w-full">Back to sign in</Button></Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={needsSetup ? "Create the owner account" : "Create your account"}
      subtitle={needsSetup ? "You'll manage who can sign in and who can use the AI concierge." : "No password needed — you'll create a passkey on this device."}
    >
      <form onSubmit={create} className="space-y-4">
        <div>
          <Label htmlFor="su-name">Your name</Label>
          <Input id="su-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="su-email">Email (optional)</Label>
          <Input id="su-email" className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" />
          <p className="mt-1 text-[11px] text-fg-subtle">Only used as a label for your passkey. PerkPilot doesn&apos;t send email.</p>
        </div>
        {needsSetup && (
          <div>
            <Label htmlFor="su-code">Setup code</Label>
            <Input id="su-code" className="mt-1" type="password" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} required autoComplete="off" />
            <p className="mt-1 text-[11px] text-fg-subtle">The PERKPILOT_SETUP_CODE value from your server settings. Only needed once.</p>
          </div>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Create passkey & continue
        </Button>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </form>
      <p className="mt-6 text-center text-xs text-fg-subtle">Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></p>
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
