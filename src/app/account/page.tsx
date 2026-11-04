"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, LogOut, Plus, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useApp } from "@/lib/store/app-store";
import { useAuth } from "@/lib/store/auth-store";
import { formatDate } from "@/lib/utils";
import { passkeyErrorMessage } from "@/components/app/auth-card";
import { signOut } from "@/components/app/auth-sync";
import { PageHeader } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean };

export default function AccountPage() {
  const { authEnabled, user, status, refresh } = useAuth();
  const sync = useApp((s) => s.sync);
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/auth/passkeys");
    if (res.ok) setPasskeys((await res.json()).passkeys);
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      void load();
    }
  }, [user, load]);

  if (status !== "loading" && !authEnabled) {
    return <div className="mx-auto max-w-xl px-4 py-16"><EmptyState icon={<Users className="size-5" />} title="Logins are off" body="This deployment runs without accounts. Set PERKPILOT_AUTH=passkey to enable passkey sign-in (see docs/DEPLOYMENT.md)." /></div>;
  }
  if (!user) return <div className="mx-auto max-w-3xl px-4 py-16"><Skeleton className="h-64" /></div>;

  const addPasskey = async () => {
    setBusy(true);
    try {
      const opt = await apiFetch("/api/auth/passkeys/options", { method: "POST" });
      const o = await opt.json();
      if (!opt.ok) throw new Error(o.error);
      const response = await startRegistration({ optionsJSON: o.options });
      const res = await apiFetch("/api/auth/passkeys/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast("Passkey added", d.name);
      await load();
    } catch (e) {
      toast("Couldn't add passkey", passkeyErrorMessage(e), "warning");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const res = await apiFetch(`/api/auth/passkeys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) toast("Couldn't remove passkey", d.error, "warning");
    else {
      toast("Passkey removed");
      await load();
    }
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) {
      toast("Name updated");
      await refresh();
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Account" title={user.name} description={user.role === "owner" ? "You're the account owner — you manage who can sign in and who can use the AI concierge." : "Your PerkPilot account."} actions={user.role === "owner" ? <Link href="/admin"><Button variant="primary"><ShieldCheck /> Manage users</Button></Link> : undefined} />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-xl"><Fingerprint className="size-5 text-[color:var(--gold)]" /> Passkeys</h2>
            <Button size="sm" variant="outline" onClick={addPasskey} disabled={busy}><Plus /> Add a passkey</Button>
          </div>
          <p className="mb-4 text-sm text-fg-muted">Add a passkey on each device you use. Passkeys synced by iCloud Keychain or Google Password Manager work across your devices automatically.</p>
          {!passkeys ? (
            <Skeleton className="h-24" />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {passkeys.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <KeyRound className="size-4 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.name} {p.backedUp && <Badge variant="accent" className="ml-1">Synced</Badge>}</p>
                    <p className="text-xs text-fg-subtle">Added {formatDate(p.createdAt.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}{p.lastUsedAt ? ` · last used ${formatDate(p.lastUsedAt.slice(0, 10), { month: "short", day: "numeric" })}` : ""}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(p.id)} disabled={passkeys.length <= 1} aria-label={`Remove passkey ${p.name}`} title={passkeys.length <= 1 ? "You can't remove your only passkey" : "Remove"}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
            <h2 className="font-display flex items-center gap-2 text-xl"><Sparkles className="size-5 text-[color:var(--gold)]" /> AI concierge</h2>
            {user.aiEnabled ? (
              <p className="mt-2 text-sm text-fg-muted"><Badge variant="success">Enabled</Badge> The concierge uses the AI model for your questions (within a daily allowance).</p>
            ) : (
              <p className="mt-2 text-sm text-fg-muted"><Badge>Free mode</Badge> The concierge answers with PerkPilot&apos;s built-in planner. The account owner can enable the AI model for you.</p>
            )}
          </section>
          <section className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
            <h2 className="font-display text-xl">Profile</h2>
            <form onSubmit={saveName} className="mt-3 flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Your name" />
              <Button type="submit" variant="outline" disabled={!name.trim() || name === user.name}>Save</Button>
            </form>
            <p className="mt-3 text-xs text-fg-subtle">Household sync: {sync.error ? <span className="text-warning">{sync.error}</span> : sync.lastSyncedAt ? `last synced ${new Date(sync.lastSyncedAt).toLocaleString()}` : "waiting for first sync"}</p>
          </section>
          <section className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => signOut(false)}><LogOut /> Sign out</Button>
              <Button variant="ghost" onClick={() => signOut(true)}>Sign out on all devices</Button>
            </div>
            <p className="mt-3 text-[11px] text-fg-subtle">Signing out saves your changes to the server and clears this device&apos;s copy.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
