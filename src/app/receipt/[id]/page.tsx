import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { listings, payments } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { formatUsd, atomicToUsd } from "@/lib/x402/money";
import { addressUrl, txUrl, USDG } from "@/lib/chains";
import { PrintButton } from "./PrintButton";

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
    // sha256 of the delivered bytes: anyone holding the response can check it is what was paid for.
    ...(p.responseSha256 ? [["Response SHA-256", <span key="h" className="break-all font-mono">{p.responseSha256}</span>] as [string, React.ReactNode]] : []),
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
    </div>
  );
}
