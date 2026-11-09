import type { Metadata } from "next";
import { H, LEGAL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy", description: "What x402Fi collects, why, and your choices." };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" current="/privacy">
      <p>
        This policy explains what information {LEGAL.entity} (&ldquo;we&rdquo;) collects when you use {LEGAL.site} at{" "}
        {LEGAL.domain}, how we use it, and the choices you have. We designed {LEGAL.site} to need as little personal
        information as possible: there are no accounts with names or passwords, and we run no advertising or analytics trackers.
      </p>

      <H>Public by design: blockchain data</H>
      <p>
        Wallet addresses, payment amounts, transaction hashes and ENS records are recorded on public blockchains (Robinhood
        Chain and Ethereum). Anyone can see them, and neither we nor anyone else can delete them. Receipts on {LEGAL.site}
        show this on-chain information and are accessible to anyone with the receipt link.
      </p>

      <H>What we collect</H>
      <ul>
        <li><strong>Wallet address and sign-in.</strong> When you sign in, we record your wallet address and keep a signed session cookie so you stay signed in. We do not receive your private keys.</li>
        <li><strong>Listing information</strong> you provide as a seller: service name and description, your API&rsquo;s URL, prices, payout wallet, payee name, and optional logo, website and X handle. Most of this is shown publicly; your API&rsquo;s URL and secret header are not.</li>
        <li><strong>Payment ledger.</strong> For each paid call: payer and payee wallet addresses, amount, transaction hash, the request path, status and timing. Sellers see the ledger for their own listings and can export it.</li>
        <li><strong>Technical data.</strong> Our hosting provider (Cloudflare) processes IP addresses, request metadata and logs to deliver and protect the Service. We use these only for security, debugging and abuse prevention.</li>
        <li><strong>Email.</strong> If you write to <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>, we receive your email address and message.</li>
      </ul>

      <H>What we do not collect</H>
      <ul>
        <li>No names, phone numbers, government IDs or payment card details are required to use {LEGAL.site}.</li>
        <li>No advertising cookies, analytics trackers or cross-site tracking. Listing logos are fetched by our servers, so viewing a listing does not contact the seller&rsquo;s servers from your browser.</li>
      </ul>

      <H>Cookies and local storage</H>
      <ul>
        <li><strong>Session cookie</strong> (<code>x402fi_session</code>): keeps you signed in; strictly necessary.</li>
        <li><strong>Wallet connection state</strong>: stored by the wallet connection library so your wallet reconnects; strictly necessary.</li>
        <li><strong>Preferences</strong> in your browser&rsquo;s local storage: your light/dark theme and any unsent listing draft. They never leave your device.</li>
      </ul>

      <H>How we use information</H>
      <ul>
        <li>to operate the Service: verify and settle payments, forward paid requests, show listings, receipts and dashboards;</li>
        <li>to keep the Service secure and prevent fraud, abuse and violations of our <a href="/terms">Terms</a>;</li>
        <li>to respond to messages and requests;</li>
        <li>to comply with law and enforce our rights.</li>
      </ul>
      <p>We do not sell your personal information and do not share it for cross-context behavioral advertising.</p>

      <H>Who we share it with</H>
      <ul>
        <li><strong>Sellers</strong> receive the paying wallet address with each paid request, and see payments to their listings.</li>
        <li><strong>Service providers</strong> who run parts of the Service for us: Cloudflare (hosting, database, email forwarding), Reown/WalletConnect (wallet connections), and blockchain RPC providers such as Alchemy (reading and submitting transactions).</li>
        <li><strong>Public blockchains</strong>, by the nature of on-chain payments.</li>
        <li><strong>Authorities</strong>, when required by law or to protect rights, safety and the Service.</li>
      </ul>

      <H>Retention</H>
      <p>
        We keep listing and ledger records while your listings exist and as needed for records, security and legal
        obligations. On-chain data is permanent and outside our control. Sign-in sessions expire after 7 days.
      </p>

      <H>Your rights</H>
      <p>
        Depending on where you live (for example, under the GDPR or California law), you may have rights to access, correct,
        delete or receive a copy of your personal information, and to object to or restrict certain processing. Email{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> to make a request; we will respond within the time the law requires.
        We cannot alter or delete information recorded on a blockchain.
      </p>

      <H>International transfers</H>
      <p>
        We operate from the United States and our providers run globally. Your information may be processed outside your
        country, with safeguards required by applicable law.
      </p>

      <H>Children</H>
      <p>The Service is not intended for anyone under 18, and we do not knowingly collect their information.</p>

      <H>Changes</H>
      <p>We will post any changes here and update the effective date above.</p>

      <H>Contact</H>
      <p>
        {LEGAL.entity} · <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>
    </LegalPage>
  );
}
