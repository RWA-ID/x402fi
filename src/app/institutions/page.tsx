import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "For institutions", description: "How x402Fi handles custody, counterparty verification, records and controls for agent payments." };

const Q: Array<[string, string]> = [
  ["Who holds the funds?", "Nobody but the buyer and the seller. The buyer signs an authorization for an exact amount; it moves USDG directly from the buyer's wallet to the seller's. x402Fi submits the transaction and pays its gas, but at no point has custody or the ability to redirect funds."],
  ["How do we know who we are paying?", "Sellers can link an x402 Identity (ENS) name. The name's owner, and only the owner, writes records listing the service address and the payout wallet. x402Fi checks those records on Ethereum before showing a Verified payee badge, and any agent can run the same check itself with the open-source verifier."],
  ["What records do we get?", "A ledger of every paid attempt, a receipt page per payment and a CSV export with UTC timestamps, amounts, payer and payee addresses and transaction hashes that can be checked on a public explorer."],
  ["Can we cap spend or revenue?", "Sellers can set a daily revenue limit per service and pause any listing instantly. Buyers control spend at the wallet: the authorization model means an agent can never be charged more than it signed for."],
  ["What if the service fails?", "Payment is settled only after the seller's API answers successfully. Errors and timeouts leave the authorization unused, so the buyer is not charged, and the ledger records the failure."],
  ["Can we pay out to a multisig?", "Yes. Any EVM address works as the payout wallet, including a Safe. It can be rotated from the dashboard."],
  ["Which assets and networks?", "USDG (Global Dollar, issued by Paxos) on Robinhood Chain, network ID 4663. Identity names live on Ethereum mainnet."],
  ["Is this regulated?", "x402Fi is software: it does not custody assets, exchange currencies or extend credit. Each organisation should assess its own obligations for accepting stablecoin payments in its jurisdictions."],
];

export default function Institutions() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <p className="eyebrow">For institutions</p>
        <h1 className="display mt-3 max-w-4xl text-5xl sm:text-7xl">Agent payments your <span className="chip-hl">auditors</span> can follow.</h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-2">
          If your teams are being asked about x402 and agentic payments, this page explains what happens to the money, who can
          see what, and what your controllers will have at month end.
        </p>
      </section>
      <section className="mx-auto mt-14 grid max-w-6xl gap-3 px-4 sm:px-6 md:grid-cols-2">
        {Q.map(([q, a]) => (
          <div key={q} className="card p-6">
            <h2 className="text-lg font-medium">{q}</h2>
            <p className="mt-2 text-ink-2">{a}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl bg-forest p-8 text-forest-ink sm:p-12">
          <h2 className="display text-4xl sm:text-5xl">Start with a <span className="italic">pilot.</span></h2>
          <p className="mt-4 max-w-xl opacity-80">List one internal or partner-facing API at a nominal price, make a few calls from a test wallet, and export the ledger. It costs nothing to list and takes about five minutes.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sell/new" className="btn btn-sand">List a pilot service</Link>
            <Link href="/learn" className="btn bg-forest-2">See a payment step by step</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
