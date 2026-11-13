"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignInGate } from "@/components/SignInGate";
import { formatUsd } from "@/lib/x402/money";
import { txUrl } from "@/lib/chains";
import { useSession } from "@/lib/client/useSession";
import { EndpointsEditor } from "./EndpointsEditor";

interface L { id: string; slug: string; name: string; status: "draft" | "live" | "paused"; priceAtomic: string; payTo: string; identityName: string | null; logoUrl: string | null; websiteUrl: string | null; xHandle: string | null; revenueAtomic: string; calls: number; missingExamples?: string[] }
interface P { id: string; listingId: string; serviceId: string | null; payer: string; amountAtomic: string; status: string; txHash: string | null; error: string | null; createdAt: number; requestPath: string }
interface Data { listings: L[]; payments: P[]; serviceNames: Record<string, string>; daily: { day: string; revenueAtomic: string; calls: number }[]; totals: { revenueAtomic: string; calls: number; failed: number } }

const STATUS: Record<string, [string, string]> = {
  settled: ["Paid", "text-good"],
  pending: ["Processing", "text-ink-3"],
  settle_failed: ["Not settled", "text-bad"],
  upstream_failed: ["API error · not charged", "text-warn"],
};

export function Dashboard() {
  return (
    <SignInGate why="Your listings, revenue, ledger and receipts are tied to the wallet you sign in with.">
      {(seller) => <Inner seller={seller} />}
    </SignInGate>
  );
}

function Inner({ seller }: { seller: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const { signOut } = useSession();
  const load = useCallback(async () => {
    const r = await fetch("/api/dashboard");
    if (!r.ok) { setErr("Could not load your dashboard."); return; }
    setData((await r.json()) as Data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, body: object) => {
    const r = await fetch(`/api/listings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; upstreamSecret?: string };
    if (!r.ok) alertInline(j.error ?? "Update failed");
    await load();
    return j;
  };
  const [notice, setNotice] = useState("");
  const alertInline = (m: string) => { setNotice(m); setTimeout(() => setNotice(""), 6000); };

  if (err) return <p className="text-bad">{err}</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const names = new Map(data.listings.map((l) => [l.id, l.name]));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="display mt-2 text-5xl">Your <span className="italic">revenue</span></h1>
          <p className="mt-2 font-mono text-xs text-ink-3">{seller}</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/payments/csv" className="btn btn-ghost">Export CSV</a>
          <Link href="/sell/new" className="btn btn-primary">New listing</Link>
          <button onClick={signOut} className="btn btn-ghost">Sign out</button>
        </div>
      </div>
      {notice && <p className="mt-4 rounded-lg bg-card p-3 text-sm text-warn">{notice}</p>}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Revenue, all time" value={formatUsd(data.totals.revenueAtomic)} />
        <Stat label="Paid calls" value={data.totals.calls.toLocaleString()} />
        <Stat label="Calls not charged" value={data.totals.failed.toLocaleString()} hint="Your API errored or settlement failed; buyers paid nothing." />
      </div>

      <DailyChart daily={data.daily} />

      <h2 className="display mt-12 text-3xl">Listings</h2>
      {data.listings.length === 0 ? (
        <div className="card mt-4 p-8 text-center text-ink-2">No listings yet. <Link href="/sell/new" className="underline">List your first service</Link>, free.</div>
      ) : (
        <div className="mt-4 space-y-3">
          {data.listings.map((l) => (
            <ListingRow key={l.id} l={l} patch={patch} notify={alertInline} reload={load} />
          ))}
        </div>
      )}

      <h2 className="display mt-12 text-3xl">Ledger</h2>
      <p className="mt-1 text-sm text-ink-3">Every paid attempt, including ones where the buyer was not charged. Latest 100; export CSV for all.</p>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-ink-3">
            <tr className="border-b border-line">
              {["Time (UTC)", "Service", "Amount", "Payer", "Status", "Proof"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => {
              const [label, tone] = STATUS[p.status] ?? [p.status, ""];
              return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{new Date(p.createdAt * 1000).toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="px-4 py-3">{names.get(p.listingId)}{p.serviceId && data.serviceNames[p.serviceId] && data.serviceNames[p.serviceId] !== names.get(p.listingId) ? <span className="block text-xs text-ink-3">{data.serviceNames[p.serviceId]}</span> : null}</td>
                  <td className="px-4 py-3 font-mono">{formatUsd(p.amountAtomic)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.payer.slice(0, 6)}…{p.payer.slice(-4)}</td>
                  <td className={`px-4 py-3 ${tone}`} title={p.error ?? ""}>{label}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link href={`/receipt/${p.id}`} className="underline">Receipt</Link>
                      {p.txHash && <a href={txUrl(p.txHash)} target="_blank" rel="noreferrer" className="underline">Tx</a>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!data.payments.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-3">No payments yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card bg-card p-5">
      <div className="eyebrow">{label}</div>
      <div className="display mt-2 text-4xl">{value}</div>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function ListingRow({ l, patch, notify, reload }: { l: L; patch: (id: string, b: object) => Promise<{ upstreamSecret?: string }>; notify: (m: string) => void; reload: () => void }) {
  const [editing, setEditing] = useState<null | "payTo" | "name" | "profile">(null);
  const [prof, setProf] = useState({ logoUrl: "", websiteUrl: "", xHandle: "" });
  const [profErr, setProfErr] = useState("");
  const [val, setVal] = useState("");
  const [secret, setSecret] = useState("");
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${l.status === "live" ? "bg-good" : l.status === "paused" ? "bg-warn" : "bg-ink-3"}`} />
            <Link href={`/market/${l.slug}`} className="font-medium hover:underline">{l.name}</Link>
            <span className="text-sm capitalize text-ink-3">{l.status}</span>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-3">/g/{l.slug} · {l.calls} paid · {formatUsd(l.revenueAtomic)}</p>
          <p className="mt-1 font-mono text-xs text-ink-3">payout {l.payTo.slice(0, 8)}…{l.payTo.slice(-6)} · {l.identityName ?? "no named payee"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {l.status === "live" ? (
            <button className="btn btn-ghost py-2" onClick={() => patch(l.id, { status: "paused" })}>Pause</button>
          ) : (
            <button className="btn btn-ghost py-2" onClick={() => patch(l.id, { status: "live" })}>Go live</button>
          )}
          <button className="btn btn-ghost py-2" onClick={() => { setEditing("payTo"); setVal(l.payTo); }}>Change payout</button>
          <button className="btn btn-ghost py-2" onClick={() => { setEditing("name"); setVal(l.identityName ?? ""); }}>Named payee</button>
          <button className="btn btn-ghost py-2" onClick={() => { setEditing("profile"); setProfErr(""); setProf({ logoUrl: l.logoUrl ?? "", websiteUrl: l.websiteUrl ?? "", xHandle: l.xHandle ? "@" + l.xHandle : "" }); }}>Profile</button>
          <button className="btn btn-ghost py-2" onClick={async () => { const j = await patch(l.id, { rotateSecret: true }); if (j.upstreamSecret) { setSecret(j.upstreamSecret); notify("New secret issued. Update your API now: the old one stops being sent immediately."); } }}>Rotate secret</button>
        </div>
      </div>
      {editing === "profile" && (
        <div className="mt-4 space-y-3 rounded-xl bg-card p-4">
          <p className="text-sm text-ink-2">{l.identityName ? <>Records on <span className="font-mono">{l.identityName}</span> (<span className="font-mono">avatar</span>, <span className="font-mono">url</span>, <span className="font-mono">com.twitter</span>) take precedence and show as verified. These fill any gaps, marked &ldquo;by seller&rdquo;.</> : <>Shown as &ldquo;provided by the seller&rdquo;. Link a payee name to show them as verified.</>}</p>
          {([["logoUrl", "Logo (https:// or ipfs:// PNG, JPEG, WebP or GIF, max 1 MB)", "https://yourco.com/logo.png"], ["websiteUrl", "Website", "https://yourco.com"], ["xHandle", "X profile", "@yourco"]] as const).map(([k, label, ph]) => (
            <label key={k} className="block">
              <span className="eyebrow">{label}</span>
              <input className="field mt-1.5" value={prof[k]} placeholder={ph} spellCheck={false} onChange={(e) => setProf((p) => ({ ...p, [k]: e.target.value }))} />
            </label>
          ))}
          {profErr && <p className="text-sm text-bad">{profErr}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={async () => {
              const r = await fetch(`/api/listings/${l.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ logoUrl: prof.logoUrl || null, websiteUrl: prof.websiteUrl || null, xHandle: prof.xHandle || null }) });
              const j = (await r.json().catch(() => ({}))) as { error?: string };
              if (!r.ok) { setProfErr(j.error ?? "Could not save."); return; }
              setEditing(null); reload();
            }}>Save profile</button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      {editing && editing !== "profile" && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input className="field" value={val} onChange={(e) => setVal(e.target.value)} placeholder={editing === "payTo" ? "0x…" : "yourco.402api.eth (empty to remove)"} spellCheck={false} />
          <button className="btn btn-primary" onClick={async () => { await patch(l.id, editing === "payTo" ? { payTo: val } : { identityName: val || null }); setEditing(null); }}>Save</button>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}
      {editing === "payTo" && l.identityName && <p className="mt-2 text-xs text-warn">After changing the payout, update the Robinhood Chain address on {l.identityName} too, or the payee check will fail.</p>}
      {secret && <p className="mt-3 break-all rounded-lg bg-card p-3 font-mono text-xs">X-X402Fi-Secret: {secret}</p>}
      {!!l.missingExamples?.length && (
        <div className="mt-4 rounded-xl border border-warn/40 bg-card p-4 text-sm">
          <p className="font-medium">Add an example response to {l.missingExamples.length === 1 ? "this endpoint" : `these ${l.missingExamples.length} endpoints`}: {l.missingExamples.join(", ")}</p>
          <p className="mt-1 text-ink-2">AI agents read it in x402Fi&apos;s discovery feed and MCP server to decide whether a call is worth paying for, and buyers see it on your listing. Use <strong>Edit</strong> on the endpoint below and paste what a successful call returns.</p>
        </div>
      )}
      <EndpointsEditor listingId={l.id} slug={l.slug} onChange={reload} />
    </div>
  );
}

/**
 * Daily revenue, last 30 days, one bar per UTC day.
 *
 * The API returns only days that had payments, so the days in between are filled in
 * here. Without that, a seller with one paid day got one bar stretched across the
 * whole card: a solid block that read as anything but a chart.
 */
function DailyChart({ daily }: { daily: Data["daily"] }) {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29 + i));
    const day = d.toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, revenueAtomic: "0", calls: 0 };
  });
  const max = Math.max(1, ...days.map((d) => Number(d.revenueAtomic)));
  const total = days.reduce((a, d) => a + BigInt(d.revenueAtomic), 0n);
  const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section className="card mt-3 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="eyebrow">Last 30 days</div>
        <div className="text-sm text-ink-2">{formatUsd(total.toString())}</div>
      </div>
      {daily.length ? (
        <>
          <div className="mt-4 flex h-32 items-end gap-[3px] border-b border-line" role="img" aria-label={`Daily revenue, last 30 days: ${formatUsd(total.toString())} total`}>
            {days.map((x) => {
              const v = Number(x.revenueAtomic);
              return (
                <div key={x.day} className="group relative flex h-full flex-1 items-end">
                  <div className={`w-full rounded-t-sm ${v ? "bg-ink/80 group-hover:bg-ink" : "bg-line"}`} style={{ height: v ? `${Math.max(4, (v / max) * 100)}%` : "2px" }} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-bg group-hover:block">{label(x.day)}: {formatUsd(x.revenueAtomic)} · {x.calls} {x.calls === 1 ? "call" : "calls"}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs text-ink-3">
            <span>{label(days[0].day)}</span>
            <span>{label(days[29].day)}</span>
          </div>
        </>
      ) : <p className="mt-3 text-sm text-ink-3">No paid calls yet. Share your paid URL or try your own listing.</p>}
    </section>
  );
}
