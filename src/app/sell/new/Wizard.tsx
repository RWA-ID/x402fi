"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { getAddress, isAddress } from "viem";
import { SignInGate } from "@/components/SignInGate";
import { buildPaymentRequired } from "@/lib/x402/requirements";
import { usdToAtomic, formatUsd, atomicToUsd, MIN_PRICE_ATOMIC, MIN_PRICE_LABEL } from "@/lib/x402/money";
import { slugify } from "@/lib/names";
import { baseLooksLikeEndpoint, normalizePath, upstreamFor } from "@/lib/wizard";
import { IdentityStep } from "./IdentityStep";
import { Copy } from "@/components/Copy";

const STEPS = ["Service", "Endpoints", "Name", "Test", "Publish"] as const;
const CATEGORIES = ["Market data", "AI & agents", "Research", "Compliance & KYB", "Data feeds", "Developer tools", "Other"];
const MAX_ENDPOINTS = 20;

export interface EndpointDraft {
  id: string;
  name: string;
  method: "GET" | "POST";
  path: string;
  price: string;
  /** Proxied listings only: forwarded without payment (a status or lookup endpoint). */
  free: boolean;
  /** ?query or /path/suffix used in examples, "Try it" and the connection test. */
  example: string;
  /** POST: the JSON body sent to read a native endpoint's 402, and shown as the example. */
  exampleBody: string;
  /** What a successful call returns, shown to buyers and to agents (Bazaar output example). */
  exampleResponse: string;
}

export interface Draft {
  name: string; summary: string; description: string; category: string;
  /** Base URL of the seller's API. Endpoint paths are appended to it. */
  upstreamUrl: string;
  endpoints: EndpointDraft[];
  payTo: string; dailyCap: string;
  identityName: string;
  /** The endpoints already charge with x402: x402Fi lists them, buyers pay the seller directly. */
  native: boolean;
}

const newEndpoint = (over: Partial<EndpointDraft> = {}): EndpointDraft => ({
  id: Math.random().toString(36).slice(2, 10), name: "", method: "GET", path: "/", price: "0.01", free: false, example: "", exampleBody: "", exampleResponse: "", ...over,
});
const EMPTY: Draft = { name: "", summary: "", description: "", category: "", upstreamUrl: "", endpoints: [newEndpoint()], payTo: "", dailyCap: "", identityName: "", native: false };
const KEY = "x402fi:draft:v2";

export function Wizard() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Unsent draft survives a reload (per-browser convenience only).
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) { const j = JSON.parse(s); setD({ ...EMPTY, ...j, endpoints: Array.isArray(j.endpoints) && j.endpoints.length ? j.endpoints.map((e: Partial<EndpointDraft>) => newEndpoint(e)) : EMPTY.endpoints }); } } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d]);

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (d.name.trim().length < 3) e.name = "Give it a name buyers will recognise (3+ characters).";
      if (d.summary.trim().length < 10) e.summary = "One sentence: what does a buyer get?";
      if (!d.category) e.category = "Pick a category.";
      if (!/^https:\/\/[^\s]+\.[^\s]+/.test(d.upstreamUrl.trim())) e.upstreamUrl = "Paste the https:// base address of your API.";
    }
    if (s === 1) {
      const seen = new Set<string>();
      d.endpoints.forEach((ep, i) => {
        const p = normalizePath(ep.path);
        if (!/^\/[A-Za-z0-9._~\-/]*$/.test(p) || p.length > 120) e[`ep.${i}.path`] = "Use a plain path like /v1/rates (letters, numbers, - _ . / only).";
        const k = `${ep.method} ${p}`;
        if (seen.has(k)) e[`ep.${i}.path`] = `${k} is listed twice.`;
        seen.add(k);
        if (!d.native && !ep.free) {
          try { const a = usdToAtomic(ep.price); if (a < MIN_PRICE_ATOMIC) e[`ep.${i}.price`] = `Minimum is ${MIN_PRICE_LABEL}.`; else if (a > 1_000_000_000n) e[`ep.${i}.price`] = "Maximum is $1,000."; } catch (err) { e[`ep.${i}.price`] = (err as Error).message; }
        }
        if (ep.method === "POST" && ep.exampleBody.trim()) { try { JSON.parse(ep.exampleBody); } catch { e[`ep.${i}.exampleBody`] = "Must be valid JSON."; } }
        const resp = ep.exampleResponse.trim();
        if (/^[[{]/.test(resp)) { try { JSON.parse(resp); } catch { e[`ep.${i}.exampleResponse`] = "This looks like JSON but does not parse."; } }
        if (resp.length > 4000) e[`ep.${i}.exampleResponse`] = "Keep it under 4,000 characters.";
      });
      if (!d.native && d.endpoints.every((ep) => ep.free)) e.endpoints = "At least one endpoint must be paid. Free endpoints sit next to the ones you charge for.";
      if (!isAddress(d.payTo.trim(), { strict: false })) e.payTo = d.native ? "Read your endpoints' 402s first: the payout wallet comes from them." : "Enter the wallet address that should receive USDG.";
      if (d.dailyCap.trim()) { try { usdToAtomic(d.dailyCap); } catch (err) { e.dailyCap = (err as Error).message; } }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const next = () => validate(step) && setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  // Each step starts at the top of the page.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  return (
    <div>
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="font-mono text-sm text-ink-3 hover:text-ink">← x402Fi</Link>
            <h1 className="mt-2 font-mono text-2xl">List your service</h1>
          </div>
          <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <button
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.16em] ${i === step ? "text-ink" : i < step ? "text-ink-2 hover:text-ink" : "text-ink-3"}`}
                  aria-current={i === step ? "step" : undefined}
                >
                  <span className={`grid h-6 w-6 place-items-center border text-xs ${i === step ? "border-ink" : "border-line"}`}>{i < step ? "✓" : i + 1}</span>
                  <span className="hidden sm:inline">{s}</span>
                </button>
                {i < STEPS.length - 1 && <span className="text-ink-3">·</span>}
              </li>
            ))}
          </ol>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-2 sm:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {step === 0 && <StepService d={d} set={set} errors={errors} />}
        {step === 1 && <StepEndpoints d={d} set={set} errors={errors} />}
        {step === 2 && <IdentityStep d={d} set={set} />}
        {step === 3 && <StepTest d={d} />}
        {step === 4 && <StepLive d={d} onDone={() => { try { localStorage.removeItem(KEY); } catch {} }} />}

        {step < 4 && (
          <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
            <button onClick={back} disabled={step === 0} className="btn btn-ghost">Back</button>
            <button onClick={next} className="btn btn-primary">{step === 2 && !d.identityName ? "Skip for now" : step === 3 ? "Review & publish" : "Continue"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

type StepProps = { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; errors: Record<string, string> };

export function Field({ label, hint, error, children }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-1.5 block text-sm text-bad">{error}</span> : hint ? <span className="mt-1.5 block text-sm text-ink-3">{hint}</span> : null}
    </label>
  );
}

function Heading({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-mono text-xl">{title}</h2>
      <p className="mt-2 text-ink-2">{sub}</p>
    </div>
  );
}

function StepService({ d, set, errors }: StepProps) {
  const split = baseLooksLikeEndpoint(d.upstreamUrl);
  return (
    <div className="space-y-6">
      <Heading title="Describe your service" sub="Tell buyers exactly what they get before they pay. This is what agents and people see in the marketplace." />
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          [false, "Put x402Fi in front of my API", "No code: x402Fi charges buyers, forwards paid calls to your API and pays you."],
          [true, "My endpoints already charge with x402", "They answer 402 in USDG on Robinhood Chain. x402Fi lists them; buyers pay you directly."],
        ] as const).map(([n, t, sub]) => (
          <button key={String(n)} type="button" onClick={() => set("native", n)}
            className={`rounded-xl border p-4 text-left transition-colors ${d.native === n ? "border-ink bg-card" : "border-line hover:border-ink-3"}`}>
            <div className="font-medium">{t}</div>
            <div className="mt-1 text-sm text-ink-3">{sub}</div>
          </button>
        ))}
      </div>
      <Field label="Service name" error={errors.name}>
        <input className="field" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme FX rates" maxLength={60} />
      </Field>
      <Field label="One-line summary" error={errors.summary} hint="Shown on the marketplace card and in the 402 price quote.">
        <input className="field" value={d.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Latest EUR/USD mid rate with source and timestamp." maxLength={140} />
      </Field>
      <Field label="Category" error={errors.category}>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button type="button" key={c} onClick={() => set("category", c)} className={`rounded-full border px-3.5 py-1.5 text-sm ${d.category === c ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-ink-3"}`}>{c}</button>
          ))}
        </div>
      </Field>
      <Field label="Base URL of your API" error={errors.upstreamUrl}
        hint={<>Just the address your endpoints live under, like <span className="font-mono">https://api.acme.com</span>. You add each endpoint&apos;s path on the next step. This can&apos;t be changed after publishing.</>}>
        <input className="field" value={d.upstreamUrl} onChange={(e) => set("upstreamUrl", e.target.value)} placeholder="https://api.acme.com" inputMode="url" spellCheck={false} autoCapitalize="none" />
      </Field>
      {split && (
        <div className="rounded-lg border border-line bg-card p-4 text-sm">
          <p>
            <span className="font-mono">{split.path}</span> looks like one endpoint&apos;s path. Use <span className="font-mono">{split.origin}</span> as the base and list
            <span className="font-mono"> {split.path}</span> as an endpoint, so you can add your other endpoints too.
          </p>
          <button type="button" className="btn btn-primary mt-3 py-1.5 text-sm" onClick={() => {
            set("upstreamUrl", split.origin);
            const eps = d.endpoints.length === 1 && d.endpoints[0]!.path === "/" ? [{ ...d.endpoints[0]!, path: split.path }] : [...d.endpoints, newEndpoint({ path: split.path })];
            set("endpoints", eps);
          }}>Split it for me</button>
        </div>
      )}
      <Field label="Details (optional)" hint="Data sources, update frequency, response fields, terms of use. Include any disclaimers buyers must see.">
        <textarea className="field min-h-28" value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
      </Field>
    </div>
  );
}

function StepEndpoints({ d, set, errors }: StepProps) {
  const { address } = useAccount();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = slugify(d.name);
  const update = (i: number, patch: Partial<EndpointDraft>) => set("endpoints", d.endpoints.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => set("endpoints", d.endpoints.filter((_, j) => j !== i));
  const add = () => {
    const last = d.endpoints[d.endpoints.length - 1];
    set("endpoints", [...d.endpoints, newEndpoint({ method: last?.method ?? "GET", price: last && !last.free ? last.price : "0.01", path: "" })]);
  };
  const lowest = useMemo(() => {
    try { return d.endpoints.filter((e) => !e.free).map((e) => usdToAtomic(e.price)).reduce((a, b) => (b < a ? b : a)); } catch { return 0n; }
  }, [d.endpoints]);

  return (
    <div className="space-y-6">
      <Heading title={d.native ? "Your x402 endpoints" : "Endpoints and prices"}
        sub={d.native ? "List each endpoint. x402Fi reads its price and payout wallet from its own 402." : "Each endpoint is a path on your API with its own price per call. Add as many as you sell."} />

      <ol className="space-y-4">
        {d.endpoints.map((ep, i) => {
          const path = normalizePath(ep.path || "/");
          const ex = ep.example.trim();
          return (
            <li key={ep.id} className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="eyebrow">Endpoint {i + 1}</span>
                {d.endpoints.length > 1 && <button type="button" onClick={() => remove(i)} className="text-sm text-ink-3 underline hover:text-bad">Remove</button>}
              </div>
              <div className={`grid gap-3 ${d.native ? "sm:grid-cols-[7rem_1fr]" : "sm:grid-cols-[7rem_1fr_8.5rem]"}`}>
                <Field label="Method">
                  <select className="field" value={ep.method} onChange={(e) => update(i, { method: e.target.value as EndpointDraft["method"] })}>
                    <option>GET</option>
                    <option>POST</option>
                  </select>
                </Field>
                <Field label="Path" error={errors[`ep.${i}.path`]}>
                  <input className="field font-mono" value={ep.path} onChange={(e) => update(i, { path: e.target.value })} placeholder="/v1/rates" spellCheck={false} autoCapitalize="none" />
                </Field>
                {!d.native && (
                  <Field label="Price per call" error={errors[`ep.${i}.price`]}>
                    {ep.free ? (
                      <div className="field flex items-center font-mono text-ink-2">Free</div>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-3">$</span>
                        <input className="field" style={{ paddingLeft: "1.6rem" }} value={ep.price} onChange={(e) => update(i, { price: e.target.value })} inputMode="decimal" />
                      </div>
                    )}
                    <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                      <input type="checkbox" checked={ep.free} onChange={(e) => update(i, { free: e.target.checked })} />
                      Free, no payment
                    </label>
                  </Field>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Name (optional)">
                  <input className="field" value={ep.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={i === 0 ? d.name || "Rates" : "Historical rates"} maxLength={60} />
                </Field>
                <Field label="Example request (optional)" hint="A query or sub-path buyers can try.">
                  <input className="field font-mono" value={ep.example} onChange={(e) => update(i, { example: e.target.value })} placeholder="?pair=EURUSD" spellCheck={false} autoCapitalize="none" />
                </Field>
              </div>
              {!d.native && (
                <div className="mt-3">
                  <Field label="Example response (optional)" error={errors[`ep.${i}.exampleResponse`]} hint="What a successful call returns. Buyers see it on your listing, and AI agents read it to know what they are paying for.">
                    <textarea className="field min-h-20 font-mono text-sm" value={ep.exampleResponse} onChange={(e) => update(i, { exampleResponse: e.target.value })} placeholder='{"pair": "EURUSD", "rate": 1.0842}' spellCheck={false} />
                  </Field>
                </div>
              )}
              {ep.method === "POST" && (
                <div className="mt-3">
                  <Field label="Example JSON body (optional)" error={errors[`ep.${i}.exampleBody`]} hint={d.native ? "Sent once, unpaid, to read your 402." : "Shown to buyers as the example request."}>
                    <textarea className="field min-h-20 font-mono text-sm" value={ep.exampleBody} onChange={(e) => update(i, { exampleBody: e.target.value })} placeholder='{"pair": "EURUSD"}' spellCheck={false} />
                  </Field>
                </div>
              )}
              <div className="mt-4 space-y-1 rounded-lg bg-card p-3 font-mono text-[0.78rem] leading-relaxed">
                <div><span className="text-ink-3">Buyers call </span><span className="break-all">{d.native ? upstreamFor(d.upstreamUrl, path, ex) : `${origin}/g/${slug}${path === "/" ? "" : path}${ex}`}</span></div>
                {!d.native && <div><span className="text-ink-3">x402Fi forwards to </span><span className="break-all">{upstreamFor(d.upstreamUrl, path, ex)}</span></div>}
              </div>
            </li>
          );
        })}
      </ol>
      {errors.endpoints && <p className="text-sm text-bad">{errors.endpoints}</p>}
      {d.endpoints.length < MAX_ENDPOINTS && (
        <button type="button" onClick={add} className="w-full rounded-xl border border-dashed border-line py-3 text-sm text-ink-2 hover:border-ink-3 hover:text-ink">+ Add another endpoint</button>
      )}

      {d.native ? (
        <NativeRead d={d} set={set} errors={errors} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payout wallet on Robinhood Chain" error={errors.payTo} hint="Any EVM wallet you control, including a Safe. You can change it later.">
              <div className="flex gap-2">
                <input className="field" value={d.payTo} onChange={(e) => set("payTo", e.target.value)} placeholder="0x…" spellCheck={false} />
                {address && <button type="button" className="btn btn-ghost" onClick={() => set("payTo", getAddress(address))}>Use mine</button>}
              </div>
            </Field>
            <Field label="Daily limit (optional)" error={errors.dailyCap} hint="Stop accepting calls after this much revenue per UTC day.">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-3">$</span>
                <input className="field" style={{ paddingLeft: "1.6rem" }} value={d.dailyCap} onChange={(e) => set("dailyCap", e.target.value)} inputMode="decimal" placeholder="No limit" />
              </div>
            </Field>
          </div>
          {lowest > 0n && (
            <div className="grid grid-cols-3 gap-3">
              {[1_000n, 100_000n, 1_000_000n].map((n) => (
                <div key={n} className="card bg-card p-4">
                  <div className="eyebrow">{Number(n).toLocaleString()} calls</div>
                  <div className="display mt-1 text-2xl sm:text-3xl">{d.endpoints.length > 1 ? "from " : ""}{formatUsd(lowest * n)}</div>
                </div>
              ))}
            </div>
          )}
          <p className="rounded-lg bg-card p-4 text-sm text-ink-2">
            x402Fi takes <strong>0%</strong>. Buyers pay no gas: x402Fi covers the network fee for settling each payment, and settles only after your API answers successfully.
          </p>
        </>
      )}
    </div>
  );
}

/** Native endpoints: price and payout are read from each endpoint's own 402, never typed. */
function NativeRead({ d, set, errors }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Record<string, { ok: true; amount: string; payTo: string } | { ok: false; reason: string }>>({});
  const read = async () => {
    setBusy(true);
    const out: typeof res = {};
    for (const ep of d.endpoints) {
      const url = upstreamFor(d.upstreamUrl, ep.path, ep.example);
      const r = await fetch("/api/listings/probe-native", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, method: ep.method, body: ep.method === "POST" ? ep.exampleBody || "{}" : null }) })
        .then((r) => r.json() as Promise<{ ok: true; quote: { amount: string; payTo: string } } | { ok: false; reason: string }>).catch(() => ({ ok: false as const, reason: "Network error" }));
      out[ep.id] = r.ok ? { ok: true, amount: r.quote.amount, payTo: r.quote.payTo } : { ok: false, reason: r.reason };
    }
    setRes(out);
    const first = Object.values(out).find((r) => r.ok) as { payTo: string } | undefined;
    if (first) set("payTo", first.payTo);
    set("endpoints", d.endpoints.map((e) => { const r = out[e.id]; return r && r.ok ? { ...e, price: atomicToUsd(r.amount) } : e; }));
    setBusy(false);
  };
  const wallets = new Set(Object.values(res).filter((r): r is { ok: true; amount: string; payTo: string } => r.ok).map((r) => r.payTo.toLowerCase()));
  return (
    <SignInGate why="Sign in to read your endpoints' prices. The listing will belong to this wallet.">
      {() => (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Read prices from your 402s</div>
              <div className="text-sm text-ink-3">x402Fi calls each endpoint once, unpaid.</div>
            </div>
            <button onClick={read} disabled={busy} className="btn btn-primary">{busy ? "Reading…" : Object.keys(res).length ? "Read again" : "Read my 402s"}</button>
          </div>
          {Object.keys(res).length > 0 && (
            <ul className="mt-4 divide-y divide-line text-sm">
              {d.endpoints.map((ep) => { const r = res[ep.id]; return (
                <li key={ep.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-mono">{ep.method} {normalizePath(ep.path)}</span>
                  {r?.ok ? <span className="font-mono">{formatUsd(r.amount)} USDG → {r.payTo.slice(0, 6)}…{r.payTo.slice(-4)}</span> : <span className="text-bad">{r?.reason ?? "not read"}</span>}
                </li>
              ); })}
            </ul>
          )}
          {wallets.size > 1 && <p className="mt-3 text-sm text-bad">These endpoints pay different wallets. One listing has one payout wallet: list the others separately.</p>}
          {errors.payTo && !wallets.size && <p className="mt-3 text-sm text-bad">{errors.payTo}</p>}
          <p className="mt-4 text-sm text-ink-2">Buyers pay you <strong>directly</strong>. x402Fi lists your endpoints, checks your payee name and shows your record; it never touches the payment and takes <strong>0%</strong>.</p>
        </div>
      )}
    </SignInGate>
  );
}

type TestResult = { ok: boolean; status?: number; ms?: number; contentType?: string; sample?: string; error?: string };

/** What an unpaid test answer means, in plain words. */
function explain(r: TestResult, native: boolean): { tone: "good" | "warn" | "bad"; text: string } {
  if (!r.status) return { tone: "bad", text: r.error ?? "Could not reach your API." };
  const s = r.status;
  if (native) {
    if (s === 402) return { tone: "good", text: "Answered 402 with its price, as expected." };
    return { tone: "warn", text: `Answered HTTP ${s} instead of 402. Buyers must get a 402 price quote from this endpoint.` };
  }
  if (s >= 200 && s < 300) return { tone: "good", text: `Reached your API · HTTP ${s}.` };
  if (s === 402) return { tone: "warn", text: "Your API asked for payment itself. If it already charges with x402, list it as “already charges with x402”. Otherwise let requests that carry X-X402Fi-Secret through: paid calls will." };
  if (s === 401 || s === 403) return { tone: "warn", text: `Reached your API, which refused an unauthenticated call (HTTP ${s}). Expected if you check X-X402Fi-Secret: this test doesn't send it, paid calls will.` };
  if (s === 404) return { tone: "bad", text: "HTTP 404: no endpoint at this address. Check the base URL and the path." };
  if (s === 400 || s === 422) return { tone: "warn", text: `Reached your API, which wants different input (HTTP ${s}). Add an example request so buyers see a working call.` };
  if (s >= 500) return { tone: "bad", text: `Your API errored (HTTP ${s}). You can still publish; buyers are not charged when it fails.` };
  return { tone: "warn", text: `Reached your API · HTTP ${s}.` };
}

function StepTest({ d }: { d: Draft }) {
  const [res, setRes] = useState<Record<string, TestResult>>({});
  const [busy, setBusy] = useState(false);
  const first = d.endpoints.find((e) => d.native || !e.free) ?? d.endpoints[0];
  const preview = useMemo(() => {
    try {
      return JSON.stringify(buildPaymentRequired({
        url: `${typeof window !== "undefined" ? window.location.origin : ""}/g/${slugify(d.name)}${first && normalizePath(first.path) !== "/" ? normalizePath(first.path) : ""}`,
        description: d.summary, amountAtomic: usdToAtomic(first?.price ?? "0.01"), payTo: getAddress(d.payTo), identityName: d.identityName || null,
      }), null, 2);
    } catch { return ""; }
  }, [d, first]);
  const run = async () => {
    setBusy(true);
    const out: Record<string, TestResult> = {};
    await Promise.all(d.endpoints.map(async (ep) => {
      out[ep.id] = await fetch("/api/listings/check-upstream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: upstreamFor(d.upstreamUrl, ep.path, ep.example), method: ep.method }) })
        .then((r) => r.json() as Promise<TestResult>).catch(() => ({ ok: false, error: "Network error" }));
    }));
    setRes(out); setBusy(false);
  };
  const ran = Object.keys(res).length > 0;
  return (
    <SignInGate why="Your listings, ledger and receipts belong to the wallet you sign in with.">
      {() => (
        <div className="space-y-6">
          <Heading title="Test the connection" sub={<>x402Fi calls each endpoint once, without payment and without your secret header, to check it can reach it.</>} />
          <div className="card divide-y divide-line">
            {d.endpoints.map((ep) => {
              const r = res[ep.id];
              const x = r ? explain(r, d.native) : null;
              return (
                <div key={ep.id} className="p-4">
                  <code className="block break-all font-mono text-[0.8rem]">{ep.method} {upstreamFor(d.upstreamUrl, ep.path, ep.example)}</code>
                  {x && <p className={`mt-2 text-sm ${x.tone === "good" ? "text-good" : x.tone === "bad" ? "text-bad" : "text-ink-2"}`}>{x.tone === "good" ? "✓ " : x.tone === "bad" ? "✕ " : "• "}{x.text}{r?.ms ? ` (${r.ms} ms)` : ""}</p>}
                  {r?.sample && <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-bg p-3 font-mono text-[0.72rem]">{r.sample}</pre>}
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3 p-4">
              <span className="text-sm text-ink-3">{ran ? "Problems here don't block publishing; you can fix your API later." : `${d.endpoints.length} endpoint${d.endpoints.length > 1 ? "s" : ""} to test.`}</span>
              <button onClick={run} disabled={busy} className="btn btn-primary">{busy ? "Calling…" : ran ? "Run again" : "Run test"}</button>
            </div>
          </div>
          {!d.native && (
            <div>
              <h3 className="eyebrow">What an agent will see first</h3>
              <p className="mt-2 text-sm text-ink-2">Every unpaid call gets this price quote (HTTP 402) instead of your data:</p>
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-forest p-4 font-mono text-[0.75rem] text-forest-ink">{preview}</pre>
            </div>
          )}
        </div>
      )}
    </SignInGate>
  );
}

function StepLive({ d, onDone }: { d: Draft; onDone: () => void }) {
  const [state, setState] = useState<"review" | "saving" | "done" | "error">("review");
  const [out, setOut] = useState<{ slug: string; upstreamSecret: string } | null>(null);
  const [err, setErr] = useState<string>("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publish = async () => {
    setState("saving");
    const body = {
      name: d.name, summary: d.summary, description: d.description, category: d.category, upstreamUrl: d.upstreamUrl.trim(),
      payTo: d.payTo, dailyCap: d.dailyCap, identityName: d.identityName, native: d.native, publish: true,
      endpoints: d.endpoints.map((e) => ({ name: e.name.trim() || undefined, method: e.method, path: normalizePath(e.path), price: !d.native && e.free ? null : e.price, pricing: !d.native && e.free ? "free" : undefined, exampleRequest: e.example.trim() || null, exampleBody: e.method === "POST" ? e.exampleBody.trim() || null : null, exampleResponse: !d.native ? e.exampleResponse.trim() || null : null })),
    };
    const r = await fetch("/api/listings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string; slug: string; upstreamSecret: string };
    if (!r.ok) {
      const msgs = j.errors ? Object.entries(j.errors).map(([k, m]) => { const ep = /^endpoints\.(\d+)\./.exec(k); return ep ? `Endpoint ${Number(ep[1]) + 1}: ${m}` : m; }) : [j.error ?? "Could not publish."];
      setErr(msgs.join(" ")); setState("error"); return;
    }
    setOut(j); setState("done"); onDone();
  };
  if (state === "done" && out) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="eyebrow">Live</p>
          <h2 className="display mt-2 text-5xl">You’re open for <span className="italic">business.</span></h2>
        </div>
        <div className="space-y-3">
          {d.endpoints.map((e) => {
            const path = normalizePath(e.path);
            return <Copy key={e.id} label={`${e.method} ${path} · ${d.native ? "paid to you directly" : e.free ? "free" : `$${e.price}`}`} value={d.native ? upstreamFor(d.upstreamUrl, path, "") : `${origin}/g/${out.slug}${path === "/" ? "" : path}`} />;
          })}
        </div>
        {!d.native && (
          <Copy label="Secret header (shown once, also in your dashboard)" value={out.upstreamSecret}
            hint="Every paid call reaches your API with X-X402Fi-Secret set to this value. Reject requests without it, so nobody can call your API around the paywall." />
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={`/market/${out.slug}`} className="btn btn-primary">View listing</Link>
          <Link href="/dashboard" className="btn btn-ghost">Go to dashboard</Link>
          <Link href="/developers" className="btn btn-ghost">Developer options</Link>
        </div>
      </div>
    );
  }
  return (
    <SignInGate why="Sign in to publish. The listing belongs to this wallet.">
      {() => (
        <div className="space-y-6">
          <Heading title="Review and publish" sub="Listing is free. You can pause, edit endpoints, change the payout wallet or add a name any time." />
          <dl className="card divide-y divide-line text-sm">
            {[
              ["Name", d.name], ["Summary", d.summary], ["Category", d.category], ["Base URL", d.upstreamUrl],
              ["Payout wallet", d.payTo], ["Daily limit", d.dailyCap ? `$${d.dailyCap}` : "None"],
              ["Named payee", d.identityName || "None yet (add one any time)"],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
                <dt className="text-ink-3">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h3 className="eyebrow">Endpoints</h3>
            <ul className="card mt-2 divide-y divide-line text-sm">
              {d.endpoints.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="font-mono">{e.method} {normalizePath(e.path)}{e.name ? <span className="ml-2 font-sans text-ink-3">{e.name}</span> : null}</span>
                  <span className="font-mono">{d.native ? `$${e.price} · from your 402` : e.free ? "Free" : `$${e.price}`}</span>
                </li>
              ))}
            </ul>
          </div>
          {state === "error" && <p className="text-sm text-bad">{err}</p>}
          <button onClick={publish} disabled={state === "saving"} className="btn btn-primary w-full py-3 text-base">{state === "saving" ? "Publishing…" : "Publish, free"}</button>
          <p className="text-center text-xs text-ink-3">
            By publishing you agree to the <Link href="/terms" className="underline">Terms of Service</Link> and confirm you have the right to sell access to this service.
            See also the <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      )}
    </SignInGate>
  );
}
