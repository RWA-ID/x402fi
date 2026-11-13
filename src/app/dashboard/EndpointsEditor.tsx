"use client";
import { useCallback, useEffect, useState } from "react";
import { atomicToUsd, formatUsd } from "@/lib/x402/money";

interface Svc {
  id: string; name: string; summary: string; method: string; path: string;
  pricing: "free" | "fixed" | "quote" | "contract" | "native"; priceAtomic: string | null; quotePath: string | null; maxPriceAtomic: string | null;
  exampleRequest: string | null; exampleBody: string | null; exampleResponse: string | null; status: "live" | "paused";
}
interface Form {
  name: string; summary: string; method: "GET" | "POST"; path: string;
  pricing: "free" | "fixed" | "quote" | "native"; price: string; quotePath: string; maxPrice: string; exampleRequest: string; exampleBody: string; exampleResponse: string;
}
const EMPTY: Form = { name: "", summary: "", method: "GET", path: "/", pricing: "fixed", price: "0.01", quotePath: "", maxPrice: "", exampleRequest: "", exampleBody: "", exampleResponse: "" };

const toForm = (s: Svc): Form => ({
  name: s.name, summary: s.summary, method: s.method as Form["method"], path: s.path, pricing: s.pricing === "contract" ? "quote" : s.pricing,
  price: s.priceAtomic ? atomicToUsd(s.priceAtomic) : "", quotePath: s.quotePath ?? "", maxPrice: s.maxPriceAtomic ? atomicToUsd(s.maxPriceAtomic) : "",
  exampleRequest: s.exampleRequest ?? "",
  exampleBody: s.exampleBody ?? "",
  exampleResponse: s.exampleResponse ?? "",
});

export function EndpointsEditor({ listingId, slug, onChange }: { listingId: string; slug: string; onChange: () => void }) {
  const [rows, setRows] = useState<Svc[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/listings/${listingId}/services`);
    setRows(r.ok ? ((await r.json()) as Svc[]) : []);
  }, [listingId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setErrors({});
    const body = {
      ...form,
      price: form.pricing === "fixed" ? form.price : null,
      maxPrice: form.pricing === "quote" ? form.maxPrice : null,
      quotePath: form.pricing === "quote" ? form.quotePath : null,
    };
    const r = await fetch(editing === "new" ? `/api/listings/${listingId}/services` : `/api/services/${editing}`, {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string };
    setBusy(false);
    if (!r.ok) { setErrors(j.errors ?? { name: j.error ?? "Could not save." }); return; }
    setEditing(null); await load(); onChange();
  };
  const act = async (s: Svc, kind: "toggle" | "remove") => {
    setBusy(true);
    await (kind === "remove"
      ? fetch(`/api/services/${s.id}`, { method: "DELETE" })
      : fetch(`/api/services/${s.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: s.status === "live" ? "paused" : "live" }) }));
    setBusy(false); await load(); onChange();
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!rows) return <p className="mt-4 text-sm text-ink-3">Loading endpoints…</p>;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Endpoints</div>
        {editing === null && <button className="btn btn-ghost py-1.5 text-sm" onClick={() => { setForm(EMPTY); setErrors({}); setEditing("new"); }}>Add endpoint</button>}
      </div>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm">
                <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${s.status === "live" ? "bg-good" : "bg-warn"}`} />
                {s.name}
              </div>
              <div className="break-all font-mono text-xs text-ink-3">
                {s.method} /g/{slug}{s.path === "/" ? "" : s.path} · {s.pricing === "native" ? `already x402, paid directly${s.priceAtomic ? ` (${formatUsd(s.priceAtomic)})` : ""}` : s.pricing === "free" ? "free" : s.pricing === "contract" ? `on-chain, up to ${s.maxPriceAtomic ? formatUsd(s.maxPriceAtomic) : "?"}` : s.pricing === "quote" ? `quoted, up to ${s.maxPriceAtomic ? formatUsd(s.maxPriceAtomic) : "?"}` : s.priceAtomic ? formatUsd(s.priceAtomic) : "?"}
              </div>
            </div>
            <div className="flex gap-1.5">
              {s.pricing === "contract" ? (
                <span className="self-center px-2 text-xs text-ink-3" title="On-chain settlement endpoints are set up by x402Fi">Managed by x402Fi</span>
              ) : (
                <button className="btn btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => { setForm(toForm(s)); setErrors({}); setEditing(s.id); }}>Edit</button>
              )}
              <button className="btn btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => act(s, "toggle")}>{s.status === "live" ? "Pause" : "Resume"}</button>
              <button className="btn btn-ghost px-3 py-1.5 text-sm" disabled={busy || rows.length === 1} title={rows.length === 1 ? "A listing needs at least one endpoint" : "Endpoints with payments are paused instead, to keep receipts intact"} onClick={() => act(s, "remove")}>Remove</button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== null && (
        <div className="mt-3 space-y-3 rounded-xl bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name" value={form.name} onChange={(v) => set("name", v)} error={errors.name} placeholder="Register a name" />
            <Input label="One-line summary" value={form.summary} onChange={(v) => set("summary", v)} error={errors.summary} placeholder="Registers a name and sends it to the payer" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            <label className="block">
              <span className="eyebrow">Method</span>
              <select className="field mt-1.5" value={form.method} onChange={(e) => set("method", e.target.value as Form["method"])}><option>GET</option><option>POST</option></select>
            </label>
            <Input label="Path" value={form.path} onChange={(v) => set("path", v)} error={errors.path} hint={`Buyers call /g/${slug}${form.path === "/" ? "" : form.path}/… ; "/" matches every path.`} />
          </div>
          <div>
            <span className="eyebrow">Pricing</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {([["free", "Free"], ["fixed", "Fixed price"], ["quote", "Quoted per request"], ["native", "Already x402 (paid directly)"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => set("pricing", k)} className={`rounded-full border px-3 py-1.5 text-sm ${form.pricing === k ? "border-ink bg-ink text-bg" : "border-line text-ink-2"}`}>{l}</button>
              ))}
            </div>
          </div>
          {form.pricing === "fixed" && <Input label="Price per call (USD)" value={form.price} onChange={(v) => set("price", v)} error={errors.price} />}
          {form.pricing === "quote" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Price ceiling (USD)" value={form.maxPrice} onChange={(v) => set("maxPrice", v)} error={errors.maxPrice} hint="The most one call can cost. Shown to buyers; quotes above it are refused." />
              <Input label="Quote path" value={form.quotePath} onChange={(v) => set("quotePath", v)} error={errors.quotePath} placeholder="/quote/register" hint={'x402Fi GETs your API here (+ the rest of the path) and expects {"price":"5.00"} or {"amount":"5000000"}.'} />
            </div>
          )}
          {form.pricing === "native" && (
            <p className="rounded-lg bg-bg p-3 text-xs text-ink-2">Your endpoint at this path already answers 402 in USDG on Robinhood Chain. x402Fi reads its price and payTo when you save, lists it, and buyers pay you directly.</p>
          )}
          <Input label="Example (optional)" value={form.exampleRequest} onChange={(v) => set("exampleRequest", v)} placeholder="/alice or ?q=1" />
          {form.method === "POST" && (
            <Input label="Example JSON body" value={form.exampleBody} onChange={(v) => set("exampleBody", v)} error={errors.exampleBody} placeholder='{"minutes": 2, "task": "..."}' />
          )}
          {form.pricing !== "native" && (
            <label className="block">
              <span className="eyebrow">Example response (optional)</span>
              <textarea className="field mt-1.5 min-h-24 font-mono text-sm" value={form.exampleResponse} onChange={(e) => set("exampleResponse", e.target.value)} placeholder='{"pair": "EURUSD", "rate": 1.0842}' spellCheck={false} />
              {errors.exampleResponse ? <span className="mt-1 block text-xs text-bad">{errors.exampleResponse}</span> : <span className="mt-1 block text-xs text-ink-3">What a successful call returns. Shown on your listing; AI agents read it to know what they are paying for.</span>}
            </label>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : editing === "new" ? "Add endpoint" : "Save"}</button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, error, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input className="field mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} />
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}
