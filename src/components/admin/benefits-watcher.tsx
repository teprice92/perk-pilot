"use client";

import { Check, ClipboardPaste, ExternalLink, Eye, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { formatUSD } from "@/lib/calc/money";
import { useRules } from "@/lib/hooks/use-rules";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog, Switch } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

type Source = { id: string; label: string; url: string; kind: "card_benefits" | "transfer_partners"; cardId: string | null; programId: string | null; enabled: boolean; aiFetch: boolean; lastCheckedAt: string | null; lastChangedAt: string | null; lastStatus: string | null; lastMessage: string | null };
type BenefitPayload = { name: string; description: string; amountCents: number | null; period: string; enrollmentRequired: boolean; bookingChannel: string | null; limitations: string[] };
type Proposal = {
  id: string;
  action: "add" | "update" | "retire";
  ruleType: "benefit" | "transferPartner" | "transferBonus";
  ruleId: string | null;
  title: string;
  explanation: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
  payload: { benefit: BenefitPayload | null; transferPartner: { toProgram: string; ratioFrom: number; ratioTo: number; transferTime: string } | null; transferBonus: { toProgram: string; bonusPercent: number; startDate: string; endDate: string } | null };
  status: "pending" | "approved" | "rejected" | "failed";
  error: string | null;
  createdAt: string;
  source: { label: string; url: string } | null;
};
type Snapshot = { aiConfigured: boolean; schedule: string; sources: Source[]; proposals: Proposal[] };

const when = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10), { month: "short", day: "numeric" }) : "never");
const STATUS: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" | "accent" }> = {
  unchanged: { label: "No changes", variant: "success" },
  reviewed: { label: "Reviewed", variant: "success" },
  changed: { label: "Changes found", variant: "accent" },
  blocked: { label: "Can't read page", variant: "warning" },
  error: { label: "Error", variant: "danger" },
};

export function BenefitsWatcher() {
  const rules = useRules();
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paste, setPaste] = useState<Source | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: "", url: "", kind: "card_benefits" as Source["kind"], cardId: "amex-platinum", programId: "amex-mr" });
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/watch");
    const body = await res.json();
    if (res.ok) setData(body);
    else toast("Couldn't load the benefits watcher", body.error, "warning");
  }, []);
  useEffect(() => void load(), [load]);

  async function post(key: string, body: Record<string, unknown>, done?: string) {
    setBusy(key);
    try {
      const res = await apiFetch("/api/admin/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) {
        toast("Something went wrong", json.error, "warning");
        await load();
        return false;
      }
      setData(json);
      if (done) toast(done);
      return true;
    } finally {
      setBusy(null);
    }
  }

  const programName = (id: string) => rules.programs.find((p) => p.id === id)?.shortName ?? id;
  const pending = data?.proposals.filter((p) => p.status === "pending" || p.status === "failed") ?? [];
  const decided = data?.proposals.filter((p) => p.status === "approved" || p.status === "rejected") ?? [];

  const describe = (p: Proposal) => {
    if (p.payload.benefit) {
      const b = p.payload.benefit;
      return [b.amountCents !== null ? `${formatUSD(b.amountCents)} · ${b.period.replace(/_/g, " ")}` : b.period.replace(/_/g, " "), b.enrollmentRequired ? "enrollment required" : null, b.bookingChannel && b.bookingChannel !== "any" ? `via ${b.bookingChannel.replace(/_/g, " ")}` : null].filter(Boolean).join(" · ");
    }
    if (p.payload.transferPartner) {
      const t = p.payload.transferPartner;
      return `${programName(t.toProgram)} · ${t.ratioFrom}:${t.ratioTo} · ${t.transferTime}`;
    }
    if (p.payload.transferBonus) {
      const t = p.payload.transferBonus;
      return `${t.bonusPercent}% bonus to ${programName(t.toProgram)} · ${formatDate(t.startDate)} – ${formatDate(t.endDate)}`;
    }
    return "";
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-elevated shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="font-display flex items-center gap-2 text-xl"><Eye className="size-5 text-[color:var(--gold)]" /> Benefits watcher</h2>
          <p className="mt-1 text-xs text-fg-muted">Checks the official pages weekly ({data?.schedule ?? "Mondays"}) and proposes changes for you to approve. Nothing changes until you do.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => post("all", { action: "check" }, "Check finished")} disabled={busy !== null || !data}>
          {busy === "all" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check all now
        </Button>
      </div>

      {data && !data.aiConfigured && <p className="border-b border-border bg-muted px-5 py-3 text-xs text-fg-muted">ANTHROPIC_API_KEY isn&apos;t set, so pages are checked for changes but not reviewed.</p>}

      {/* Proposals */}
      <div className="border-b border-border p-5">
        <h3 className="text-sm font-semibold">Changes to review {pending.length > 0 && <Badge variant="accent" className="ml-1">{pending.length}</Badge>}</h3>
        {!data ? (
          <p className="mt-3 text-sm text-fg-subtle"><Loader2 className="mr-1 inline size-4 animate-spin" /> Loading…</p>
        ) : pending.length === 0 ? (
          <p className="mt-2 text-sm text-fg-subtle">Nothing waiting. New findings will appear here.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((p) => (
              <li key={p.id} className="rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <Badge variant={p.action === "add" ? "success" : p.action === "retire" ? "danger" : "accent"} className="mr-2 capitalize">{p.action === "retire" ? "Remove" : p.action}</Badge>
                      {p.title}
                    </p>
                    <p className="mt-1 text-sm text-fg-muted">{p.explanation}</p>
                    <p className="mt-1 text-xs text-fg-subtle">{describe(p)}</p>
                  </div>
                  <Badge variant={p.confidence === "high" ? "success" : p.confidence === "medium" ? "warning" : "danger"}>{p.confidence} confidence</Badge>
                </div>
                <blockquote className="mt-3 border-l-2 border-[color:var(--gold)] pl-3 text-xs italic text-fg-muted">“{p.evidence}”</blockquote>
                {p.payload.benefit?.limitations.length ? <p className="mt-2 text-xs text-fg-subtle">Limits: {p.payload.benefit.limitations.join(" · ")}</p> : null}
                {p.error && <p className="mt-2 text-xs text-danger">{p.error}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => post(p.id, { action: "decide", proposalId: p.id, decision: "approve" }, "Change applied")}>
                    {busy === p.id ? <Loader2 className="animate-spin" /> : <Check />} Approve
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => post(`r-${p.id}`, { action: "decide", proposalId: p.id, decision: "reject" })}>
                    <X /> Reject
                  </Button>
                  {p.source && <a href={p.source.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">{p.source.label} <ExternalLink className="size-3" /></a>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {decided.length > 0 && (
          <div className="mt-4">
            <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide" : "Show"} recent decisions ({decided.length})</button>
            {showDone && (
              <ul className="mt-2 divide-y divide-border text-sm">
                {decided.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">{p.title}</span>
                    <Badge variant={p.status === "approved" ? "success" : "neutral"}>{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Sources */}
      <div className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pages watched</h3>
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus /> Add a page</Button>
        </div>
        <ul className="mt-2 divide-y divide-border">
          {data?.sources.map((s) => {
            const st = STATUS[s.lastStatus ?? ""];
            return (
              <li key={s.id} className={cn("py-3", !s.enabled && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{s.label}</a>
                    <span className="block text-xs text-fg-subtle">Checked {when(s.lastCheckedAt)}{s.lastChangedAt ? ` · last changed ${when(s.lastChangedAt)}` : ""}</span>
                  </span>
                  {st && <Badge variant={st.variant}>{st.label}</Badge>}
                  <Button size="sm" variant="outline" disabled={busy !== null || !s.enabled} onClick={() => post(s.id, { action: "check", sourceId: s.id, force: true }, "Page reviewed")} title="Review this page now (uses AI)">
                    {busy === s.id ? <Loader2 className="animate-spin" /> : <RefreshCw />} Review
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setPaste(s); setPasteText(""); }} title="Paste the page text yourself">
                    <ClipboardPaste /> Paste text
                  </Button>
                </div>
                {s.lastMessage && <p className="mt-1 text-xs text-fg-muted">{s.lastMessage}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-fg-muted">
                  <span className="flex items-center gap-2"><Switch checked={s.enabled} onChange={(v) => post(`e-${s.id}`, { action: "source", sourceId: s.id, enabled: v })} label={`Watch ${s.label}`} /> Weekly check</span>
                  <span className="flex items-center gap-2"><Switch checked={s.aiFetch} onChange={(v) => post(`a-${s.id}`, { action: "source", sourceId: s.id, aiFetch: v })} label={`AI fetch for ${s.label}`} /> Let Claude fetch it if the site blocks PerkPilot</span>
                  <button type="button" className="ml-auto inline-flex items-center gap-1 text-fg-subtle hover:text-danger" onClick={() => post(`d-${s.id}`, { action: "source", sourceId: s.id, remove: true }, "Page removed")}><Trash2 className="size-3.5" /> Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog open={paste !== null} onClose={() => setPaste(null)} title={`Paste the text of “${paste?.label ?? ""}”`} wide>
        <p className="text-sm text-fg-muted">Open the page, select all (⌘A / Ctrl+A), copy, and paste it here. Claude compares it with PerkPilot&apos;s data and lists any changes for you to approve.</p>
        <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={10} className="mt-3 font-mono text-xs" placeholder="Paste the page text…" aria-label="Page text" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPaste(null)}>Cancel</Button>
          <Button
            disabled={pasteText.trim().length < 200 || busy !== null}
            onClick={async () => {
              if (paste && (await post(`p-${paste.id}`, { action: "paste", sourceId: paste.id, text: pasteText }, "Page reviewed"))) setPaste(null);
            }}
          >
            {busy?.startsWith("p-") ? <Loader2 className="animate-spin" /> : <Check />} Review text
          </Button>
        </div>
      </Dialog>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Watch another page">
        <div className="space-y-3">
          <div><Label htmlFor="w-label">Name</Label><Input id="w-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Amex Platinum — benefits terms" /></div>
          <div><Label htmlFor="w-url">Address</Label><Input id="w-url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" /></div>
          <div>
            <Label htmlFor="w-kind">What the page lists</Label>
            <Select id="w-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Source["kind"] })}>
              <option value="card_benefits">A card&apos;s benefits</option>
              <option value="transfer_partners">Transfer partners &amp; bonuses</option>
            </Select>
          </div>
          {draft.kind === "card_benefits" ? (
            <div><Label htmlFor="w-card">Card</Label><Select id="w-card" value={draft.cardId} onChange={(e) => setDraft({ ...draft, cardId: e.target.value })}>{rules.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          ) : (
            <div><Label htmlFor="w-prog">Points program</Label><Select id="w-prog" value={draft.programId} onChange={(e) => setDraft({ ...draft, programId: e.target.value })}>{rules.programs.filter((p) => p.kind === "bank").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
          <Button
            disabled={!draft.label || !draft.url.startsWith("https://") || busy !== null}
            onClick={async () => {
              const ok = await post("add", { action: "source", label: draft.label, url: draft.url, kind: draft.kind, cardId: draft.kind === "card_benefits" ? draft.cardId : null, programId: draft.kind === "transfer_partners" ? draft.programId : null }, "Page added");
              if (ok) setAdding(false);
            }}
          >
            Add page
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
