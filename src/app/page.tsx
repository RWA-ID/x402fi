import Link from "next/link";
import { Handshake } from "@/components/Handshake";
import { ListingCard } from "@/components/ListingCard";
import { liveListings } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

const USES = ["Market data", "FX rates", "KYB checks", "Research reports", "Model inference", "Credit signals", "Sanctions screening", "Weather", "Legal search", "Price feeds", "Document parsing", "Risk scores"];

export default async function Home() {
  const featured = (await liveListings(6)).slice(0, 6);
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
        <p className="eyebrow">x402 payments · USDG · Robinhood Chain</p>
        <h1 className="display mt-6 text-[clamp(3rem,9vw,6.5rem)]">
          Let AI agents <span className="chip-hl">pay you</span>
          <br />
          per request, <span className="italic">in dollars.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-ink-2">
          Put a price on any API in five minutes. Agents pay in USDG with every call, the money lands in your wallet, and
          every payment comes with a receipt your finance team can use.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/sell/new" className="btn btn-primary px-6 py-3 text-base">List your API, free</Link>
          <Link href="/learn" className="btn btn-ghost px-6 py-3 text-base">See how x402 works</Link>
        </div>
        <p className="mt-10 text-sm text-ink-3">
          No code · No fee to list · 0% taken from payments · The only paid step is an optional x402 Identity name
        </p>
      </section>

      {/* Handshake */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="display text-4xl sm:text-5xl">One request. <span className="italic">One payment.</span></h2>
          <Link href="/learn" className="hidden text-sm text-ink-2 underline-offset-4 hover:underline sm:block">Walk through it slowly →</Link>
        </div>
        <Handshake />
      </section>

      {/* Feature tiles */}
      <section className="mx-auto mt-6 grid max-w-6xl gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {[
          ["No code", "Paste the URL of the API you already run. x402Fi puts the paywall in front of it."],
          ["Verified payee", "Link an x402 Identity name so buyers can confirm, onchain, that they are paying you."],
          ["Audit-ready", "A ledger, a receipt for each payment and a CSV export with transaction hashes."],
          ["Self-custodial", "USDG goes from the buyer's wallet to yours. x402Fi never holds funds."],
        ].map(([t, d]) => (
          <div key={t} className="card bg-card p-6">
            <h3 className="display text-2xl">{t}</h3>
            <p className="mt-2 text-sm text-ink-2">{d}</p>
          </div>
        ))}
      </section>

      {/* Institutions block */}
      <section className="mt-20 bg-forest px-4 py-16 text-forest-ink sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="eyebrow !text-forest-ink/60">For institutions</p>
            <h2 className="display mt-3 text-5xl sm:text-6xl">Built to be <span className="italic">audited.</span></h2>
            <p className="mt-5 max-w-lg opacity-80">
              Machine payments only work at scale if a controller, an auditor and a counterparty can all check them. x402Fi
              is designed around that from the first request.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-6">
              {[["$0", "to list a service"], ["0%", "taken from payments"], ["24/7", "settlement, onchain"]].map(([n, l]) => (
                <div key={l}>
                  <div className="display text-5xl text-sand sm:text-6xl">{n}</div>
                  <div className="mt-1 text-sm opacity-70">{l}</div>
                </div>
              ))}
            </div>
            <div className="mt-10 space-y-2">
              {[
                ["Payee bound to a signed onchain name", "/learn#verified-payee"],
                ["Pay only for answers that arrive", "/learn#refunds"],
                ["Exportable ledger with transaction proofs", "/institutions"],
              ].map(([t, h]) => (
                <Link key={t} href={h} className="flex items-center justify-between rounded-lg bg-forest-2 px-4 py-4 hover:brightness-110">
                  <span>{t}</span>
                  <span aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </div>
          <ReceiptMock />
        </div>
      </section>

      {/* Marquee of uses */}
      <section className="overflow-hidden py-14" aria-label="Examples of paid services">
        <div className="marquee flex w-max gap-3">
          {[...USES, ...USES].map((u, i) => (
            <span key={i} className="rounded-full border border-line px-5 py-2 text-ink-2">{u}</span>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
        {[
          ["Businesses", "Sell data and services to AI agents without building billing, API keys or invoices.", "/sell/new", "List a service"],
          ["Institutions", "Understand x402 with a live, plain-English walkthrough, then pilot it with receipts and controls.", "/institutions", "Read the brief"],
          ["Developers", "Use the public facilitator for Robinhood Chain, or add middleware to your own server.", "/developers", "Read the docs"],
        ].map(([t, d, h, c]) => (
          <div key={t} className="card flex flex-col p-6">
            <p className="eyebrow">For</p>
            <h3 className="display mt-1 text-4xl">{t}</h3>
            <p className="mt-3 text-ink-2">{d}</p>
            <Link href={h} className="btn btn-ghost mt-6 self-start">{c} →</Link>
          </div>
        ))}
      </section>

      {/* Marketplace preview */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="display text-4xl sm:text-5xl">On the <span className="italic">market</span></h2>
          <Link href="/market" className="text-sm text-ink-2 underline-offset-4 hover:underline">Browse all →</Link>
        </div>
        {featured.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{featured.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        ) : (
          <div className="card p-10 text-center text-ink-2">
            The first services are being listed now. <Link href="/sell/new" className="underline">Be one of them.</Link>
          </div>
        )}
      </section>
    </>
  );
}

function ReceiptMock() {
  const rows: Array<[string, string]> = [
    ["Service", "FX rates · EUR/USD"],
    ["Amount", "0.01 USDG"],
    ["Payer", "0x3a1…77e0"],
    ["Paid to", "acme.402api.eth"],
    ["Payee check", "Verified · payee-bound"],
    ["Network", "Robinhood Chain (4663)"],
    ["Transaction", "0x4be2…09a2"],
  ];
  return (
    <div className="self-center rounded-2xl bg-bg p-6 text-ink shadow-2xl sm:p-8">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Payment receipt</span>
        <span className="rounded-full bg-card px-2.5 py-1 text-xs text-good">Settled</span>
      </div>
      <div className="display mt-4 text-5xl">$0.01</div>
      <dl className="mt-6 divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-right font-mono text-[0.8rem]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-ink-3">Sample receipt. Real receipts link each payment to its onchain transaction.</p>
    </div>
  );
}
