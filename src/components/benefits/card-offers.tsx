"use client";

import { Check, ClipboardPaste, ImagePlus, Loader2, Plus, Tag, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { formatUSD } from "@/lib/calc/money";
import type { CardOffer } from "@/lib/domain/types";
import { useRules } from "@/lib/hooks/use-rules";
import { useApp } from "@/lib/store/app-store";
import { cn, formatDate, todayISO } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog, EmptyState, Segmented } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

type Extracted = Omit<CardOffer, "id" | "travelerId" | "cardId" | "source" | "addedAt" | "used" | "rewardCents" | "rewardPoints" | "percent" | "minSpendCents" | "expires" | "terms"> & {
  rewardCents: number | null;
  rewardPoints: number | null;
  percent: number | null;
  minSpendCents: number | null;
  expires: string | null;
  terms: string | null;
};

const CATEGORY_LABEL: Record<CardOffer["category"], string> = { hotel: "Hotel", airline: "Airline", travel: "Travel", car_rental: "Car rental", dining: "Dining", entertainment: "Entertainment", shopping: "Shopping", other: "Other" };
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `o-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const daysUntil = (iso: string, today: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);

export function rewardLabel(o: Pick<CardOffer, "kind" | "rewardCents" | "rewardPoints" | "percent">): string {
  if (o.kind === "bonus_points" && o.rewardPoints) return `${o.rewardPoints.toLocaleString()} pts`;
  if (o.kind === "percent_back" && o.percent) return `${o.percent}% back${o.rewardCents ? ` (up to ${formatUSD(o.rewardCents)})` : ""}`;
  return o.rewardCents ? formatUSD(o.rewardCents) : "Offer";
}

/** Downscale a screenshot so uploads stay well under the server's body limit. */
async function toJpegBase64(file: File, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't open that image"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that image");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1]!;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CardOffersView({ cardFilter }: { cardFilter: string }) {
  const rules = useRules();
  const household = useApp((s) => s.household);
  const offers = useApp((s) => s.offers);
  const updateOffer = useApp((s) => s.updateOffer);
  const removeOffer = useApp((s) => s.removeOffer);
  const today = todayISO();
  const [importing, setImporting] = useState(false);
  const [manual, setManual] = useState(false);
  const [showOld, setShowOld] = useState(false);

  const holders = useMemo(() => household.travelers.flatMap((t) => t.cards.map((c) => ({ key: `${t.id}|${c.cardId}`, travelerId: t.id, cardId: c.cardId, label: `${t.name} · ${rules.card(c.cardId)?.name ?? c.cardId}` }))), [household, rules]);
  const travelerName = (id: string) => household.travelers.find((t) => t.id === id)?.name ?? id;
  const shown = offers.filter((o) => cardFilter === "all" || o.cardId === cardFilter);
  const active = shown.filter((o) => !o.used && (!o.expires || o.expires >= today)).sort((a, b) => (a.expires ?? "9999").localeCompare(b.expires ?? "9999"));
  const old = shown.filter((o) => o.used || (o.expires && o.expires < today));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-elevated p-4 shadow-card">
        <p className="max-w-2xl text-sm text-fg-muted">
          Add your Amex Offers and Chase Offers: take a screenshot of the offers list in the Amex or Chase app, or paste an offer email. PerkPilot reads them, reminds you before they expire, and flags offers that match a trip&apos;s bookings.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setManual(true)} disabled={!holders.length}><Plus /> Add by hand</Button>
          <Button size="sm" variant="accent" onClick={() => setImporting(true)} disabled={!holders.length}><ImagePlus /> Import offers</Button>
        </div>
      </div>

      {!holders.length ? (
        <EmptyState icon={<Tag className="size-5" />} title="Add your cards first" body="Offers belong to a specific card. Add your cards on the Wallet page, then import their offers here." />
      ) : active.length === 0 ? (
        <EmptyState icon={<Tag className="size-5" />} title="No offers yet" body="Import a screenshot of your Amex or Chase offers to start tracking them." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((o) => {
            const left = o.expires ? daysUntil(o.expires, today) : null;
            return (
              <article key={o.id} className="flex flex-col rounded-3xl border border-border bg-elevated p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{rules.card(o.cardId)?.issuer ?? ""} · {travelerName(o.travelerId)}</p>
                    <h3 className="truncate font-semibold">{o.merchant}</h3>
                  </div>
                  <p className="font-display shrink-0 text-xl tabular">{rewardLabel(o)}</p>
                </div>
                <p className="mt-1 flex-1 text-sm text-fg-muted">{o.description}</p>
                {o.terms && <p className="mt-1 text-xs text-fg-subtle">{o.terms}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{CATEGORY_LABEL[o.category]}</Badge>
                  {o.minSpendCents ? <Badge variant="outline">Spend {formatUSD(o.minSpendCents)}+</Badge> : null}
                  {left !== null && <Badge variant={left <= 7 ? "warning" : "neutral"}>{left === 0 ? "Expires today" : `Expires ${formatDate(o.expires!)}`}</Badge>}
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => updateOffer(o.id, { used: true })} title="Mark as used"><Check /> Used</Button>
                    <Button size="icon" variant="ghost" onClick={() => removeOffer(o.id)} aria-label={`Delete ${o.merchant} offer`}><Trash2 className="size-4" /></Button>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {old.length > 0 && (
        <div>
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setShowOld((v) => !v)}>{showOld ? "Hide" : "Show"} used and expired ({old.length})</button>
          {showOld && (
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-elevated text-sm">
              {old.map((o) => (
                <li key={o.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate">{o.merchant} · {rewardLabel(o)}</span>
                  <Badge>{o.used ? "Used" : "Expired"}</Badge>
                  {o.used && <Button size="sm" variant="ghost" onClick={() => updateOffer(o.id, { used: false })}><Undo2 /> Undo</Button>}
                  <Button size="icon" variant="ghost" onClick={() => removeOffer(o.id)} aria-label={`Delete ${o.merchant} offer`}><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ImportOffersDialog open={importing} onClose={() => setImporting(false)} holders={holders} />
      <ManualOfferDialog open={manual} onClose={() => setManual(false)} holders={holders} />
    </div>
  );
}

type Holder = { key: string; travelerId: string; cardId: string; label: string };

function ImportOffersDialog({ open, onClose, holders }: { open: boolean; onClose: () => void; holders: Holder[] }) {
  const rules = useRules();
  const addOffers = useApp((s) => s.addOffers);
  const existing = useApp((s) => s.offers);
  const [holder, setHolder] = useState(holders[0]?.key ?? "");
  const [mode, setMode] = useState<"screenshot" | "text">("screenshot");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Array<Extracted & { keep: boolean }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const h = holders.find((x) => x.key === holder) ?? holders[0];

  const reset = () => {
    setFiles([]);
    setText("");
    setFound(null);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  async function read() {
    if (!h) return;
    setBusy(true);
    setError(null);
    try {
      const images = mode === "screenshot" ? await Promise.all(files.slice(0, 4).map(async (f) => ({ mediaType: "image/jpeg" as const, data: await toJpegBase64(f) }))) : undefined;
      const res = await apiFetch("/api/offers/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardName: rules.card(h.cardId)?.name ?? h.cardId, ...(images ? { images } : { text }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the offers");
      const dupKey = (m: string, d: string) => `${m.toLowerCase()}|${d.toLowerCase()}`;
      const have = new Set(existing.filter((o) => o.cardId === h.cardId && o.travelerId === h.travelerId).map((o) => dupKey(o.merchant, o.description)));
      setFound((data.offers as Extracted[]).map((o) => ({ ...o, keep: !have.has(dupKey(o.merchant, o.description)) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the offers");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!h || !found) return;
    const now = new Date().toISOString();
    const picked = found.filter((o) => o.keep).map(({ keep: _k, ...o }): CardOffer => ({
      id: newId(),
      travelerId: h.travelerId,
      cardId: h.cardId,
      merchant: o.merchant,
      description: o.description,
      kind: o.kind,
      category: o.category,
      rewardCents: o.rewardCents ?? undefined,
      rewardPoints: o.rewardPoints ?? undefined,
      percent: o.percent ?? undefined,
      minSpendCents: o.minSpendCents ?? undefined,
      expires: o.expires ?? undefined,
      terms: o.terms ?? undefined,
      source: mode,
      addedAt: now,
    }));
    addOffers(picked);
    toast(`${picked.length} offer${picked.length === 1 ? "" : "s"} added`, "You'll see them on trips they match.");
    close();
  }

  return (
    <Dialog open={open} onClose={close} title="Import card offers" wide>
      {!found ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="offer-holder">Whose card?</Label>
            <Select id="offer-holder" value={holder} onChange={(e) => setHolder(e.target.value)}>
              {holders.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </div>
          <Segmented value={mode} onChange={setMode} options={[{ value: "screenshot", label: "Screenshots" }, { value: "text", label: "Paste text" }]} />
          {mode === "screenshot" ? (
            <div>
              <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose screenshots" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 4))} />
              <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-8 text-sm text-fg-muted hover:bg-muted">
                <ImagePlus className="size-6 text-accent" />
                {files.length ? `${files.length} screenshot${files.length === 1 ? "" : "s"} selected` : "Choose up to 4 screenshots of your offers list"}
              </button>
              <p className="mt-2 text-xs text-fg-subtle">In the Amex app: Offers → scroll the list. In the Chase app: your card → Chase Offers. Screenshots are sent to Claude to read and aren&apos;t stored.</p>
            </div>
          ) : (
            <div>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste an offer email or the offers list text…" aria-label="Offer text" />
            </div>
          )}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={read} disabled={busy || (mode === "screenshot" ? files.length === 0 : text.trim().length < 20)}>
              {busy ? <Loader2 className="animate-spin" /> : mode === "screenshot" ? <ImagePlus /> : <ClipboardPaste />} {busy ? "Reading…" : "Read offers"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">Found {found.length} offer{found.length === 1 ? "" : "s"}. Untick any you don&apos;t want — offers you already have are unticked.</p>
          <ul className="max-h-[50vh] space-y-2 overflow-auto">
            {found.map((o, i) => (
              <li key={i}>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-3", o.keep ? "border-accent" : "border-border opacity-70")}>
                  <input type="checkbox" checked={o.keep} onChange={(e) => setFound(found.map((x, k) => (k === i ? { ...x, keep: e.target.checked } : x)))} className="mt-1" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="font-medium">{o.merchant}</span><span className="tabular text-sm">{rewardLabel({ kind: o.kind, rewardCents: o.rewardCents ?? undefined, rewardPoints: o.rewardPoints ?? undefined, percent: o.percent ?? undefined })}</span></span>
                    <span className="block text-xs text-fg-muted">{o.description}</span>
                    <span className="block text-[11px] text-fg-subtle">{CATEGORY_LABEL[o.category]}{o.expires ? ` · expires ${formatDate(o.expires)}` : " · no expiry shown"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setFound(null)}><X /> Start over</Button>
            <Button onClick={save} disabled={!found.some((o) => o.keep)}><Check /> Add {found.filter((o) => o.keep).length} offers</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ManualOfferDialog({ open, onClose, holders }: { open: boolean; onClose: () => void; holders: Holder[] }) {
  const addOffers = useApp((s) => s.addOffers);
  const [f, setF] = useState({ holder: holders[0]?.key ?? "", merchant: "", description: "", reward: "", minSpend: "", expires: "", category: "hotel" as CardOffer["category"] });
  const h = holders.find((x) => x.key === f.holder) ?? holders[0];
  const dollars = (s: string) => (s.trim() ? Math.round(Number(s.replace(/[$,]/g, "")) * 100) : undefined);
  const valid = h && f.merchant.trim() && (dollars(f.reward) ?? 0) > 0;
  return (
    <Dialog open={open} onClose={onClose} title="Add an offer">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="m-holder">Card</Label><Select id="m-holder" value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })}>{holders.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></div>
        <div><Label htmlFor="m-merchant">Merchant</Label><Input id="m-merchant" value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} placeholder="Hilton" /></div>
        <div><Label htmlFor="m-cat">Category</Label><Select id="m-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as CardOffer["category"] })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <div><Label htmlFor="m-reward">Credit ($)</Label><Input id="m-reward" inputMode="decimal" value={f.reward} onChange={(e) => setF({ ...f, reward: e.target.value })} placeholder="50" /></div>
        <div><Label htmlFor="m-min">Minimum spend ($)</Label><Input id="m-min" inputMode="decimal" value={f.minSpend} onChange={(e) => setF({ ...f, minSpend: e.target.value })} placeholder="250" /></div>
        <div><Label htmlFor="m-exp">Expires</Label><Input id="m-exp" type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} /></div>
        <div><Label htmlFor="m-desc">Details (optional)</Label><Input id="m-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Online bookings only" /></div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!valid}
          onClick={() => {
            if (!h) return;
            const reward = dollars(f.reward)!;
            const min = dollars(f.minSpend);
            addOffers([{ id: newId(), travelerId: h.travelerId, cardId: h.cardId, merchant: f.merchant.trim(), description: f.description.trim() || `${min ? `Spend ${formatUSD(min)}+, get ` : ""}${formatUSD(reward)} back`, kind: "statement_credit", rewardCents: reward, minSpendCents: min, expires: f.expires || undefined, category: f.category, source: "manual", addedAt: new Date().toISOString() }]);
            toast("Offer added");
            setF({ ...f, merchant: "", description: "", reward: "", minSpend: "", expires: "" });
            onClose();
          }}
        >
          Add offer
        </Button>
      </div>
    </Dialog>
  );
}
