"use client";

import { Ban, Check, Copy, Link2, Loader2, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/store/auth-store";
import { cn, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/app/shell";
import { BenefitsWatcher } from "@/components/admin/benefits-watcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog, EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

type AdminUser = { id: string; name: string; email: string | null; role: string; aiEnabled: boolean; disabled: boolean; householdId: string | null; createdAt: string; lastLoginAt: string | null; passkeys: number; activeSessions: number; aiToday: number; aiThisMonth: number };
type Invite = { id: string; note: string | null; aiEnabled: boolean; joinHousehold: boolean; expiresAt: string; usedAt: string | null; createdAt: string };

const d = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10), { month: "short", day: "numeric", year: "numeric" }) : "—");

export default function AdminPage() {
  const { user, authEnabled, status } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [limit, setLimit] = useState(0);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [form, setForm] = useState({ note: "", aiEnabled: false, joinHousehold: true, days: 7 });
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    const [u, i] = await Promise.all([apiFetch("/api/admin/users"), apiFetch("/api/admin/invites")]);
    if (u.ok) {
      const data = await u.json();
      setUsers(data.users);
      setLimit(data.dailyLimit);
    }
    if (i.ok) setInvites((await i.json()).invites);
  }, []);

  useEffect(() => {
    if (user?.role === "owner") void load();
  }, [user, load]);

  if (status !== "loading" && (!authEnabled || user?.role !== "owner")) {
    return <div className="mx-auto max-w-xl px-4 py-16"><EmptyState icon={<ShieldCheck className="size-5" />} title="Owner only" body="Only the account owner can manage users and AI access." /></div>;
  }

  const patch = async (id: string, body: Partial<Pick<AdminUser, "aiEnabled" | "disabled">>) => {
    const res = await apiFetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const data = await res.json();
    if (!res.ok) toast("Couldn't update user", data.error, "warning");
    await load();
  };

  const remove = async (u: AdminUser) => {
    const res = await apiFetch(`/api/admin/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    if (res.ok) toast("User removed", u.name);
    else toast("Couldn't remove user", (await res.json()).error, "warning");
    setConfirmDelete(null);
    await load();
  };

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const res = await apiFetch("/api/admin/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) return toast("Couldn't create invite", data.error, "warning");
    setNewLink(data.link);
    setForm({ ...form, note: "" });
    await load();
  };

  const revoke = async (id: string) => {
    await apiFetch(`/api/admin/invites?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <PageHeader eyebrow="Owner" title="People & AI access" description={`Decide who can sign in and whose concierge questions use the paid AI model. Enabled users get up to ${limit || "—"} AI conversations a day; everyone else gets the free built-in planner.`} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
        <section className="overflow-hidden rounded-3xl border border-border bg-elevated shadow-card">
          <h2 className="font-display flex items-center gap-2 border-b border-border p-5 text-xl"><Users className="size-5 text-[color:var(--gold)]" /> Users</h2>
          {!users ? (
            <div className="p-5"><Skeleton className="h-32" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                    <th className="px-5 py-3 font-medium">Person</th>
                    <th className="px-3 py-3 font-medium">AI concierge</th>
                    <th className="px-3 py-3 font-medium">AI use (today / month)</th>
                    <th className="px-3 py-3 font-medium">Last sign-in</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.id === user?.id;
                    const sameHousehold = u.householdId && u.householdId === user?.householdId;
                    return (
                      <tr key={u.id} className={cn("border-t border-border/70", u.disabled && "opacity-60")}>
                        <td className="px-5 py-3">
                          <p className="font-medium">{u.name} {self && <span className="text-fg-subtle">(you)</span>}</p>
                          <p className="text-xs text-fg-subtle">{u.email ?? "no email"} · {u.passkeys} passkey{u.passkeys === 1 ? "" : "s"}{sameHousehold && !self ? " · shares your household" : ""}</p>
                        </td>
                        <td className="px-3 py-3">
                          <label className="flex items-center gap-2">
                            <Switch checked={u.aiEnabled} onChange={(v) => patch(u.id, { aiEnabled: v })} label={`AI concierge for ${u.name}`} />
                            <span className={cn("text-xs", u.aiEnabled ? "text-success" : "text-fg-subtle")}>{u.aiEnabled ? "On (you pay)" : "Free mode"}</span>
                          </label>
                        </td>
                        <td className="px-3 py-3 tabular">{u.aiToday} / {u.aiThisMonth}</td>
                        <td className="px-3 py-3 text-xs text-fg-muted">{d(u.lastLoginAt)}</td>
                        <td className="px-3 py-3">{u.role === "owner" ? <Badge variant="gold">Owner</Badge> : u.disabled ? <Badge variant="danger">Disabled</Badge> : <Badge variant="success">Active</Badge>}</td>
                        <td className="px-5 py-3 text-right">
                          {!self && (
                            <span className="inline-flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => patch(u.id, { disabled: !u.disabled })}>{u.disabled ? <><Check /> Enable</> : <><Ban /> Disable</>}</Button>
                              <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(u)} aria-label={`Delete ${u.name}`}><Trash2 /></Button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <form onSubmit={createInvite} className="space-y-4 rounded-3xl border border-border bg-elevated p-5 shadow-card">
            <h2 className="font-display flex items-center gap-2 text-xl"><UserPlus className="size-5 text-[color:var(--gold)]" /> Invite someone</h2>
            <div>
              <Label htmlFor="inv-note">Who is it for? (note)</Label>
              <Input id="inv-note" className="mt-1" placeholder="e.g. My husband" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={80} />
            </div>
            <label className="flex items-start justify-between gap-3 rounded-2xl bg-muted/70 px-3 py-2.5 text-sm">
              <span>Share my household<span className="block text-xs text-fg-subtle">Same cards, balances and trips, synced between you. Turn off for friends with their own wallet.</span></span>
              <Switch checked={form.joinHousehold} onChange={(v) => setForm({ ...form, joinHousehold: v })} label="Share my household" />
            </label>
            <label className="flex items-start justify-between gap-3 rounded-2xl bg-muted/70 px-3 py-2.5 text-sm">
              <span className="flex gap-1.5"><Sparkles className="mt-0.5 size-4 text-[color:var(--gold)]" /><span>Enable AI concierge<span className="block text-xs text-fg-subtle">Their questions use your Anthropic API key. You can change this any time.</span></span></span>
              <Switch checked={form.aiEnabled} onChange={(v) => setForm({ ...form, aiEnabled: v })} label="Enable AI concierge" />
            </label>
            <div>
              <Label htmlFor="inv-days">Link expires after</Label>
              <Select id="inv-days" className="mt-1" value={String(form.days)} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}>
                {[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>)}
              </Select>
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={creating}>{creating ? <Loader2 className="animate-spin" /> : <Link2 />} Create invite link</Button>
            {newLink && (
              <div className="rounded-2xl border border-[color-mix(in_oklab,var(--gold)_40%,transparent)] bg-gold-soft/50 p-3">
                <p className="text-xs font-medium">Send this link privately — it works once and is shown only now.</p>
                <div className="mt-2 flex gap-2">
                  <Input readOnly value={newLink} onFocus={(e) => e.target.select()} aria-label="Invite link" className="text-xs" />
                  <Button size="icon" variant="outline" aria-label="Copy invite link" onClick={() => { void navigator.clipboard?.writeText(newLink); toast("Invite link copied"); }}><Copy /></Button>
                </div>
              </div>
            )}
          </form>
          <div className="rounded-3xl border border-border bg-elevated p-5 shadow-card">
            <h2 className="font-display text-xl">Invites</h2>
            {invites.length === 0 ? (
              <p className="mt-3 text-sm text-fg-muted">No invites yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {invites.map((i) => {
                  const expired = !i.usedAt && new Date(i.expiresAt).getTime() < Date.now();
                  return (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{i.note || "Invite"}</span>
                        <span className="block text-xs text-fg-subtle">Created {d(i.createdAt)} · {i.joinHousehold ? "shares your household" : "own household"} · AI {i.aiEnabled ? "on" : "off"}</span>
                      </span>
                      {i.usedAt ? <Badge variant="success">Used {d(i.usedAt)}</Badge> : expired ? <Badge>Expired</Badge> : <Badge variant="accent">Open until {d(i.expiresAt)}</Badge>}
                      {!i.usedAt && <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>{expired ? "Remove" : "Revoke"}</Button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <BenefitsWatcher />
      </div>

      <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={`Delete ${confirmDelete?.name ?? ""}?`}>
        <p className="text-sm text-fg-muted">Their passkeys and sessions are removed and they can no longer sign in. Household data they shared with you stays.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmDelete && remove(confirmDelete)}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}
