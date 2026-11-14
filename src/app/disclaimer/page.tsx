import type { Metadata } from "next";
import { H, LEGAL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Disclaimer", description: "Important information about risks and what x402Fi is and is not." };

export default function Disclaimer() {
  return (
    <LegalPage title="Disclaimer" current="/disclaimer">
      <H>Software, not a financial institution</H>
      <p>
        {LEGAL.site} is software operated by {LEGAL.entity}. It is not a bank, money transmitter, payment processor, exchange,
        broker-dealer, investment adviser or custodian. It never holds, controls or transmits users&rsquo; funds: every payment
        moves directly from the buyer&rsquo;s wallet to the seller under the buyer&rsquo;s own signed authorization.
      </p>

      <H>No financial, legal or tax advice</H>
      <p>
        Nothing on {LEGAL.site}, including the explainers, examples and institution pages, is financial, investment, legal,
        accounting or tax advice. Consult your own advisers before accepting or making payments in digital assets.
      </p>

      <H>Stablecoins and blockchains</H>
      <ul>
        <li>USDG is a stablecoin issued by Paxos. {LEGAL.site} is not affiliated with, endorsed by or sponsored by Paxos, Robinhood, Robinhood Chain, ENS, Coinbase or the x402 project.</li>
        <li>Stablecoins can lose their peg, be frozen by their issuer, or be affected by regulation.</li>
        <li>Blockchain transactions are irreversible. Payments sent to a wrong address or for a faulty service cannot be recovered by us.</li>
        <li>Networks can be congested, delayed or unavailable, and network fees can change.</li>
        <li>Smart contracts, including those that settle on-chain listings such as name registrations, may contain bugs despite testing.</li>
      </ul>

      <H>Trademarks</H>
      <p>
        USDG, Global Dollar and the USDG logos are trademarks of Paxos or its affiliates. Robinhood, Robinhood Chain and their
        logos are trademarks of Robinhood Markets, Inc. or its affiliates. Other names and logos belong to their owners.{" "}
        {LEGAL.site} shows these marks only to identify the stablecoin and network its payments use. Showing them does not mean
        Paxos, Robinhood or any other owner is affiliated with, endorses or sponsors {LEGAL.site}.
      </p>

      <H>Third-party listings</H>
      <p>
        Services listed on {LEGAL.site} are offered by independent sellers. We do not endorse, audit or guarantee any listing,
        its accuracy, availability, quality or legality. A <strong>Verified payee</strong> badge means only that, when checked,
        the seller&rsquo;s ENS name listed the service&rsquo;s address and payout wallet; it says nothing about who the seller
        is or whether they are trustworthy. Profile links marked &ldquo;by seller&rdquo; are unverified.
      </p>

      <H>Examples and figures</H>
      <p>
        Sample receipts, prices and figures on the site are illustrative unless they link to a real transaction.
      </p>

      <H>Your responsibility</H>
      <p>
        You are responsible for your wallet and keys, for checking what you sign, and for complying with the laws and tax rules
        that apply to you. Use of {LEGAL.site} is at your own risk and subject to our <a href="/terms">Terms of Service</a>.
      </p>

      <H>Contact</H>
      <p>
        {LEGAL.entity} · <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>
    </LegalPage>
  );
}
