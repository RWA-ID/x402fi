import type { Metadata } from "next";
import Link from "next/link";
import { Handshake } from "@/components/Handshake";

export const metadata: Metadata = { title: "How x402 works", description: "A plain-English walkthrough of x402: how AI agents pay for an API call in USDG." };

const GLOSSARY: Array<[string, string, string]> = [
  ["x402", "x402", "An open standard for paying for things over HTTP. It gives the long-reserved status code 402 (Payment Required) a precise meaning, so software can pay software without accounts or API keys."],
  ["402", "HTTP 402", "The reply that says “this costs money” and includes the exact price, token, network and recipient."],
  ["usdg", "USDG", "Global Dollar, a US-dollar stablecoin issued by Paxos. One USDG is designed to be redeemable for one dollar."],
  ["robinhood-chain", "Robinhood Chain", "A public blockchain (network ID 4663) where the USDG transfer is recorded. Payments are final within seconds."],
  ["facilitator", "Facilitator", "The service that checks a payment signature and submits it to the chain. x402Fi runs one for Robinhood Chain and pays the network fee."],
  ["payto", "payTo", "The wallet that receives the money. In a 402 quote it is chosen by the seller."],
  ["verified-payee", "Verified payee", "A check, defined by the x402 payee-name extension, that the service's address and its payTo wallet are both listed on an ENS name. Only the name's owner can write those records, so a passing check means the same party controls both."],
  ["eip3009", "EIP-3009 authorization", "A signed permission to move an exact amount once, before a deadline. The buyer signs; anyone can submit it; nobody can change the amount or reuse it."],
  ["refunds", "Pay only for answers", "On x402Fi the payment is settled after the seller's API responds successfully. If the API errors or times out, the authorization is never used and the buyer is not charged."],
];

export default function Learn() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <p className="eyebrow">How x402 works</p>
      <h1 className="display mt-3 max-w-4xl text-5xl sm:text-7xl">The web had a status code for payments. <span className="italic">Now it works.</span></h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        x402 lets an AI agent pay for a single API call the moment it needs it, in dollars, without an account, a subscription or
        an invoice. Here is one call, step by step. Click any step.
      </p>
      <div className="mt-10"><Handshake detailed auto={false} /></div>

      <div className="mt-16 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="display text-4xl">Why it matters to a business</h2>
          <ul className="mt-5 space-y-4 text-ink-2">
            <li><strong className="text-ink">New customers.</strong> Agents can buy from you without a human signing up first.</li>
            <li><strong className="text-ink">No billing stack.</strong> No keys to issue, no invoices to chase, no card fees on tiny amounts.</li>
            <li><strong className="text-ink">Prices that fit.</strong> Charge a cent per call if that is what a call is worth.</li>
            <li><strong className="text-ink">Instant settlement.</strong> Money arrives with the request, every day of the year.</li>
          </ul>
        </div>
        <div>
          <h2 className="display text-4xl">What it does not do</h2>
          <ul className="mt-5 space-y-4 text-ink-2">
            <li>It does not identify the buyer. A payment proves a wallet paid, not who owns it.</li>
            <li>It does not replace contracts or terms of service for large customers.</li>
            <li>It cannot reverse a settled payment. Disputes are handled between buyer and seller.</li>
            <li>It is not a security of any kind and pays no yield. It is a payment.</li>
          </ul>
        </div>
      </div>

      <h2 className="display mt-20 text-4xl">Glossary</h2>
      <dl className="mt-6 grid gap-3 md:grid-cols-2">
        {GLOSSARY.map(([id, term, def]) => (
          <div key={id} id={id} className="card scroll-mt-24 p-5">
            <dt className="font-medium">{term}</dt>
            <dd className="mt-1 text-sm text-ink-2">{def}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-14 flex flex-wrap gap-3">
        <Link href="/market" className="btn btn-primary">Try a paid call</Link>
        <Link href="/sell/new" className="btn btn-ghost">List your own service</Link>
      </div>
    </div>
  );
}
