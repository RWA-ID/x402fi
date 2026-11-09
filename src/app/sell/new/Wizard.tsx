"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { getAddress, isAddress } from "viem";
import { SignInGate } from "@/components/SignInGate";
import { buildPaymentRequired } from "@/lib/x402/requirements";
import { usdToAtomic, formatUsd, MIN_PRICE_ATOMIC, MIN_PRICE_LABEL } from "@/lib/x402/money";
import { IdentityStep } from "./IdentityStep";
import { Copy } from "@/components/Copy";

const STEPS = ["Service", "Price & payout", "Identity", "Test", "Go live"] as const;
const CATEGORIES = ["Market data", "AI & agents", "Research", "Compliance & KYB", "Data feeds", "Developer tools", "Other"];

export interface Draft {
  name: string; summary: string; description: string; category: string;
  upstreamUrl: string; method: "GET" | "POST"; exampleRequest: string;
  price: string; payTo: string; dailyCap: string;
  identityName: string;
}

const EMPTY: Draft = { name: "", summary: "", description: "", category: "", upstreamUrl: "", method: "GET", exampleRequest: "", price: "0.01", payTo: "", dailyCap: "", identityName: "" };
const KEY = "x402fi:draft";

export function Wizard() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Unsent draft survives a reload (per-browser convenience only).
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setD({ ...EMPTY, ...JSON.parse(s) }); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d]);

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (d.name.trim().length < 3) e.name = "Give it a name buyers will recognise (3+ characters).";
      if (d.summary.trim().length < 10) e.summary = "One sentence: what does a buyer get?";
      if (!d.category) e.category = "Pick a category.";
      if (!/^https:\/\/[^\s]+\.[^\s]+/.test(d.upstreamUrl.trim())) e.upstreamUrl = "Paste the https:// address of your API.";
    }
    if (s === 1) {
      try { const a = usdToAtomic(d.price); if (a < MIN_PRICE_ATOMIC) e.price = `Minimum is ${MIN_PRICE_LABEL}: settling a payment costs about half a cent in gas.`; } catch (err) { e.price = (err as Error).message; }
      if (!isAddress(d.payTo.trim(), { strict: false })) e.payTo = "Enter the wallet address that should receive USDG.";
      if (d.dailyCap.trim()) { try { usdToAtomic(d.dailyCap); } catch (err) { e.dailyCap = (err as Error).message; } }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const next = () => validate(step) && setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

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
        {step === 1 && <StepPrice d={d} set={set} errors={errors} />}
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

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-1.5 block text-sm text-bad">{error}</span> : hint ? <span className="mt-1.5 block text-sm text-ink-3">{hint}</span> : null}
    </label>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-8">
      <h2 className="font-mono text-xl">{title}</h2>
      <p className="mt-2 text-ink-2">{sub}</p>
    </div>
  );
}

function StepService({ d, set, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <Heading title="Describe your service" sub="Tell buyers exactly what they get before they pay. This is what agents and people see in the marketplace." />
      <Field label="Service name" error={errors.name}>
        <input className="field" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="EUR/USD reference rates" maxLength={60} />
      </Field>
      <Field label="One-line summary" error={errors.summary} hint="Shown on the marketplace card and in the 402 price quote.">
        <input className="field" value={d.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Returns the latest EUR/USD mid rate with source and timestamp." maxLength={140} />
      </Field>
      <Field label="Category" error={errors.category}>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button type="button" key={c} onClick={() => set("category", c)} className={`rounded-full border px-3.5 py-1.5 text-sm ${d.category === c ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-ink-3"}`}>{c}</button>
          ))}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <Field label="Method">
          <select className="field" value={d.method} onChange={(e) => set("method", e.target.value as Draft["method"])}>
            <option>GET</option>
            <option>POST</option>
          </select>
        </Field>
        <Field label="Your API's URL" error={errors.upstreamUrl} hint="Your existing endpoint. x402Fi forwards paid calls here. Buyers never see it.">
          <input className="field" value={d.upstreamUrl} onChange={(e) => set("upstreamUrl", e.target.value)} placeholder="https://api.yourcompany.com/v1/rates" inputMode="url" />
        </Field>
      </div>
      <Field label="Example query (optional)" hint="Added to the URL in examples and in “Try it”, e.g. ?pair=EURUSD">
        <input className="field" value={d.exampleRequest} onChange={(e) => set("exampleRequest", e.target.value)} placeholder="?pair=EURUSD" />
      </Field>
      <Field label="Details (optional)" hint="Data sources, update frequency, response fields, terms of use.">
        <textarea className="field min-h-28" value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
      </Field>
    </div>
  );
}

function StepPrice({ d, set, errors }: StepProps) {
  const { address } = useAccount();
  let atomic = 0n;
  try { atomic = usdToAtomic(d.price); } catch {}
  return (
    <div className="space-y-6">
      <Heading title="Set your price and payout" sub="Buyers pay this in USDG, a dollar stablecoin issued by Paxos, on every call. It goes straight to your wallet." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price per call (USD)" error={errors.price}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-3">$</span>
            <input className="field pl-7" value={d.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" />
          </div>
        </Field>
        <Field label="Daily limit (optional)" error={errors.dailyCap} hint="Stop accepting calls after this much revenue per UTC day.">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-ink-3">$</span>
            <input className="field pl-7" value={d.dailyCap} onChange={(e) => set("dailyCap", e.target.value)} inputMode="decimal" placeholder="No limit" />
          </div>
        </Field>
      </div>
      {atomic > 0n && (
        <div className="grid grid-cols-3 gap-3">
          {[1_000n, 100_000n, 1_000_000n].map((n) => (
            <div key={n} className="card bg-card p-4">
              <div className="eyebrow">{Number(n).toLocaleString()} calls</div>
              <div className="display mt-1 text-3xl">{formatUsd(atomic * n)}</div>
            </div>
          ))}
        </div>
      )}
      <Field label="Payout wallet on Robinhood Chain" error={errors.payTo} hint="Any EVM wallet you control, including a Safe. You can change it later.">
        <div className="flex gap-2">
          <input className="field" value={d.payTo} onChange={(e) => set("payTo", e.target.value)} placeholder="0x…" spellCheck={false} />
          {address && <button type="button" className="btn btn-ghost" onClick={() => set("payTo", getAddress(address))}>Use mine</button>}
        </div>
      </Field>
      <p className="rounded-lg bg-card p-4 text-sm text-ink-2">
        x402Fi takes <strong>0%</strong>. Buyers pay no gas: x402Fi covers the network fee for settling each payment.
      </p>
    </div>
  );
}

function StepTest({ d }: { d: Draft }) {
  const [res, setRes] = useState<null | { ok: boolean; status?: number; ms?: number; contentType?: string; sample?: string; error?: string }>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => {
    try {
      return JSON.stringify(buildPaymentRequired({
        url: `${typeof window !== "undefined" ? window.location.origin : ""}/g/<your-service>`,
        description: d.summary, amountAtomic: usdToAtomic(d.price), payTo: getAddress(d.payTo), identityName: d.identityName || null,
      }), null, 2);
    } catch { return ""; }
  }, [d]);
  const check = async () => {
    setBusy(true);
    const r = await fetch("/api/listings/check-upstream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: withExample(d.upstreamUrl, d.exampleRequest), method: d.method }) }).then((r) => r.json() as Promise<NonNullable<typeof res>>).catch(() => ({ ok: false, error: "Network error" }));
    setRes(r); setBusy(false);
  };
  return (
    <SignInGate why="Your listings, ledger and receipts belong to the wallet you sign in with.">
      {() => (
        <div className="space-y-6">
          <Heading title="Test the connection" sub="x402Fi calls your API once, without payment, to make sure it can reach it." />
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <code className="break-all font-mono text-sm">{d.method} {withExample(d.upstreamUrl, d.exampleRequest)}</code>
              <button onClick={check} disabled={busy} className="btn btn-primary">{busy ? "Calling…" : res ? "Run again" : "Run test"}</button>
            </div>
            {res && (
              <div className="mt-4 text-sm">
                {res.ok ? (
                  <p className="text-good">Reached your API · HTTP {res.status} in {res.ms} ms{res.contentType ? ` · ${res.contentType.split(";")[0]}` : ""}</p>
                ) : (
                  <p className="text-bad">{res.error ?? `Your API answered HTTP ${res.status}.`} You can still publish and fix this later.</p>
                )}
                {res.sample && <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-bg p-3 font-mono text-[0.75rem]">{res.sample}</pre>}
              </div>
            )}
          </div>
          <div>
            <h3 className="eyebrow">What an agent will see first</h3>
            <p className="mt-2 text-sm text-ink-2">Every unpaid call gets this price quote (HTTP 402) instead of your data:</p>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-forest p-4 font-mono text-[0.75rem] text-forest-ink">{preview}</pre>
          </div>
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
    const r = await fetch("/api/listings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...d, publish: true }) });
    const j = (await r.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string; slug: string; upstreamSecret: string };
    if (!r.ok) { setErr(j.errors ? Object.values(j.errors).join(" ") : j.error ?? "Could not publish."); setState("error"); return; }
    setOut(j); setState("done"); onDone();
  };
  if (state === "done" && out) {
    const url = `${origin}/g/${out.slug}`;
    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="eyebrow">Live</p>
          <h2 className="display mt-2 text-5xl">You’re open for <span className="italic">business.</span></h2>
        </div>
        <Copy label="Your paid URL: share this with agents" value={url} />
        <Copy label="Secret header (shown once)" value={out.upstreamSecret} hint="Every paid call reaches your API with X-X402Fi-Secret set to this value. Reject requests without it to stop anyone bypassing the paywall." />
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
          <Heading title="Review and publish" sub="Listing is free. You can pause, edit the payout wallet or add an identity any time." />
          <dl className="card divide-y divide-line text-sm">
            {[
              ["Name", d.name], ["Summary", d.summary], ["Category", d.category], ["Forwards to", `${d.method} ${d.upstreamUrl}`],
              ["Price", `${d.price.startsWith("$") ? d.price : "$" + d.price} per call, in USDG`], ["Payout wallet", d.payTo], ["Daily limit", d.dailyCap ? `$${d.dailyCap}` : "None"],
              ["Named payee", d.identityName || "Not linked (optional)"],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
                <dt className="text-ink-3">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
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

/**
 * The URL the gateway would call for the example: a path ("/0x…/names") is appended
 * to the upstream's path, a query ("?pair=EURUSD") to its query, like the gateway does.
 */
function withExample(upstream: string, example: string) {
  const ex = example.trim();
  if (!ex) return upstream;
  try {
    const u = new URL(upstream);
    if (ex.startsWith("/")) {
      const [p, q] = ex.split("?");
      u.pathname = u.pathname.replace(/\/$/, "") + p;
      if (q) new URLSearchParams(q).forEach((v, k) => u.searchParams.append(k, v));
    } else if (ex.startsWith("?")) {
      new URLSearchParams(ex.slice(1)).forEach((v, k) => u.searchParams.append(k, v));
    }
    return u.toString();
  } catch {
    return upstream;
  }
}

