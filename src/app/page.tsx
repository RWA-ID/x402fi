import Link from "next/link";
import { headers } from "next/headers";
import { Handshake } from "@/components/Handshake";
import { ListingCard } from "@/components/ListingCard";
import { liveListings } from "@/lib/server/queries";
import { withPayeeBadges } from "@/lib/server/payeeBadges";

export const dynamic = "force-dynamic";

const USES = ["Market data", "FX rates", "KYB checks", "Research reports", "Model inference", "Credit signals", "Sanctions screening", "Weather", "Legal search", "Price feeds", "Document parsing", "Risk scores"];

export default async function Home() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const featured = await withPayeeBadges((await liveListings(6)).slice(0, 6), origin);
  return (
    <>
      {/* Hero */}
      <section className="relative mb-[72px] overflow-hidden border-b border-line">
        <div aria-hidden className="hero-dots absolute inset-0" />
        <div className="relative mx-auto flex min-h-[min(88vh,900px)] max-w-[1360px] flex-col items-center justify-center px-6 pb-[clamp(88px,10vw,128px)] pt-[clamp(96px,12vw,160px)] text-center">
          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <span className="font-mono text-xs uppercase tracking-[.18em] text-ink-3">x402 payments on</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/robinhood-chain.png" alt="Robinhood Chain" width={1400} height={184} className="block h-[22px] w-auto" />
          </div>
          <h1 className="mt-7 font-serif text-[clamp(3.25rem,10vw,8.5rem)] font-normal leading-[1.06] tracking-[-0.03em] [text-wrap:balance]">
            Let AI agents{" "}
            <span className="mb-[.1em] inline-block rounded-[.12em] bg-chip px-[.12em] pb-[.08em] pt-[.04em] leading-[.86] text-chip-ink">pay you</span>
            <br />
            per request, <em>in</em>{" "}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/usdg-brandmark.png" alt="Global Dollar USDG" width={2000} height={660} className="ml-[.06em] inline h-[.92em] w-auto align-[-0.16em]" />
          </h1>
          <p className="mx-auto mt-8 max-w-[600px] text-[19px] leading-[1.6] text-ink-2 [text-wrap:pretty]">
            Put a price on any API in five minutes. Agents pay in USDG with every call, the money lands in your wallet, and
            every payment comes with a receipt your finance team can use.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/sell/new" className="btn rounded-[10px] bg-chip px-[26px] py-[15px] text-base text-chip-ink hover:opacity-[.92]">List your API, free</Link>
            <Link href="/learn" className="btn rounded-[10px] border border-line bg-card px-[26px] py-[15px] text-base hover:bg-line">See how x402 works</Link>
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[13.5px] text-ink-3">
            <span className="inline-flex items-center gap-3 rounded-full border border-line bg-[#f6f4ef] py-2 pl-3.5 pr-4">
              <span className="font-mono text-[11px] uppercase tracking-[.14em] text-[#6f756c]">Settles in</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/usdg-brandmark.png" alt="Global Dollar USDG" width={2000} height={660} className="block h-6 w-auto" />
            </span>
            <span>No code</span><span aria-hidden>·</span><span>Free to list</span><span aria-hidden>·</span><span>0% taken from payments</span>
          </div>
        </div>
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
          <div key={t} className="spot spot-feature rounded-2xl border border-line p-6">
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
      <section className="marquee-fade overflow-hidden py-14" aria-label="Examples of paid services">
        <div className="marquee flex w-max gap-3">
          {[...USES, ...USES].map((u, i) => (
            <span key={i} className="whitespace-nowrap rounded-full border border-accent px-5 py-[9px] text-ink-2">{u}</span>
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
          <div key={t} className="spot spot-audience flex flex-col rounded-2xl border border-line p-7">
            <p className="eyebrow">For</p>
            <h3 className="display mt-1 text-4xl">{t}</h3>
            <p className="mb-7 mt-3 text-ink-2">{d}</p>
            <Link href={h} className="btn btn-ghost mt-auto self-start">{c} →</Link>
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs text-good"><span className="h-1.5 w-1.5 rounded-full bg-good" />Settled</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/usdg-token.png" alt="USDG" width={40} height={40} className="h-10 w-10" />
        <span className="font-serif text-[56px] leading-none">0.01</span>
        <span className="mb-1.5 self-end font-mono text-[13px] text-ink-3">USDG</span>
      </div>
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
