import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { listings, payments, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { formatUsd, atomicToUsd } from "@/lib/x402/money";
import { addressUrl, txUrl, USDG } from "@/lib/chains";
import { PrintButton } from "./PrintButton";
import { receiptChecks, type CheckState } from "@/lib/receiptChecks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment receipt", robots: { index: false } };

const LABEL: Record<string, string> = { settled: "Settled", pending: "Processing", settle_failed: "Not settled · not charged", upstream_failed: "Service error · not charged" };

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = db(await envAsync());
  const p = await d.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!p) notFound();
  const l = await d.query.listings.findFirst({ where: eq(listings.id, p.listingId), columns: { name: true, slug: true, identityName: true } });
  const svc = p.serviceId ? await d.query.services.findFirst({ where: eq(services.id, p.serviceId), columns: { pricing: true } }) : null;
  const checks = receiptChecks(p, svc?.pricing ?? null);
  const rows: Array<[string, React.ReactNode]> = [
    ["Receipt ID", <span key="i" className="font-mono">{p.id}</span>],
    ["Date (UTC)", new Date(p.createdAt * 1000).toUTCString()],
    ["Service", l?.name ?? "Unknown"],
    ["Request", <span key="r" className="font-mono">{p.requestPath}</span>],
    ["Amount", `${atomicToUsd(p.amountAtomic)} USDG`],
    ["Asset", <a key="a" href={addressUrl(USDG.address)} className="font-mono underline" target="_blank" rel="noreferrer">USDG {USDG.address.slice(0, 10)}…</a>],
    ["Network", "Robinhood Chain (eip155:4663)"],
    ["Payer", <a key="p" href={addressUrl(p.payer)} className="font-mono underline" target="_blank" rel="noreferrer">{p.payer}</a>],
    ["Paid to", <a key="t" href={addressUrl(p.payTo)} className="font-mono underline" target="_blank" rel="noreferrer">{p.payTo}</a>],
    ["Named payee", l?.identityName ?? "None"],
    ["Transaction", p.txHash ? <a key="x" href={txUrl(p.txHash)} className="break-all font-mono underline" target="_blank" rel="noreferrer">{p.txHash}</a> : "None"],
  ];
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
      <nav className="mb-4 flex items-center justify-between text-sm print:hidden">
        {l ? (
          <Link href={`/market/${l.slug}`} className="text-ink-3 hover:text-ink">← {l.name}</Link>
        ) : (
          <Link href="/market" className="text-ink-3 hover:text-ink">← Marketplace</Link>
        )}
        <Link href="/dashboard" className="text-ink-3 hover:text-ink">Dashboard</Link>
      </nav>
      <div className="card p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <span className="eyebrow">x402Fi payment receipt</span>
          <span className={`rounded-full bg-card px-3 py-1 text-xs ${p.status === "settled" ? "text-good" : "text-warn"}`}>{LABEL[p.status] ?? p.status}</span>
        </div>
        <div className="display mt-5 text-6xl">{formatUsd(p.amountAtomic)}</div>
        <dl className="mt-8 divide-y divide-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
              <dt className="text-ink-3">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-ink-3">
          The transaction hash is the proof of payment: anyone can check it on the Robinhood Chain explorer. x402Fi never held these
          funds; they moved directly from payer to payee under the payer&apos;s signed authorization (EIP-3009).
        </p>
        <PrintButton />
      </div>
      {checks.length > 0 && (
        <section className="card mt-4 p-6 sm:p-10" aria-labelledby="checks">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="checks" className="eyebrow">Checks on this payment</h2>
            <span className="text-xs text-ink-3">run by x402Fi</span>
          </div>
          <ul className="mt-5 space-y-4">
            {checks.map((c) => (
              <li key={c.title} className="grid grid-cols-[1.5rem_1fr] gap-3">
                <CheckIcon state={c.state} />
                <div className="min-w-0">
                  <div className="font-medium">{c.title}</div>
                  <p className="mt-0.5 text-sm text-ink-2">{c.detail}</p>
                  {c.value && <p className="mt-1.5 break-all font-mono text-xs text-ink-3">{c.value}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-line pt-4 text-xs text-ink-3">
            Response scans use AgentWormhole&apos;s{" "}
            <a className="underline" href="https://github.com/runningoffcode/agent-wormhole" target="_blank" rel="noopener noreferrer">wormhole-x402</a>{" "}
            rules: they catch careless injections and are not a guarantee. Agents can add their own guard before signing:{" "}
            <Link className="underline" href="/developers#paying-safely">paying safely</Link>.
          </p>
        </section>
      )}
    </div>
  );
}

function CheckIcon({ state }: { state: CheckState }) {
  const tone = state === "pass" ? "text-good" : state === "warn" ? "text-warn" : "text-ink-3";
  return (
    <svg viewBox="0 0 20 20" className={`mt-0.5 h-5 w-5 ${tone}`} fill="none" stroke="currentColor" strokeWidth="2" aria-label={state === "pass" ? "passed" : state === "warn" ? "warning" : "not charged"}>
      <circle cx="10" cy="10" r="8.25" strokeWidth="1.5" />
      {state === "pass" && <path d="M6.2 10.3 8.8 12.8 13.8 7.4" strokeLinecap="round" strokeLinejoin="round" />}
      {state === "warn" && <path d="M10 6v5M10 13.6v.1" strokeLinecap="round" />}
      {state === "fail" && <path d="M7 10h6" strokeLinecap="round" />}
    </svg>
  );
}
