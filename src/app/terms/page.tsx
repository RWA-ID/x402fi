import type { Metadata } from "next";
import Link from "next/link";
import { H, LEGAL, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service", description: "The terms for using x402Fi." };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" current="/terms">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {LEGAL.site} at {LEGAL.domain}, including its website,
        payment gateway, facilitator, discovery feed and related software (together, the &ldquo;Service&rdquo;). The Service is
        operated by {LEGAL.entity} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the Service, connecting a wallet, signing in,
        listing a service or paying for one, you agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <H>1. What x402Fi is</H>
      <p>
        {LEGAL.site} is software that helps sellers charge for API calls and on-chain products using the open x402 payment
        standard, with payments in USDG on Robinhood Chain. Buyers, which may be people or automated agents, sign a payment
        authorization in their own wallet. {LEGAL.site} checks that authorization, forwards the request to the seller and submits
        the payment to the blockchain.
      </p>
      <p>
        <strong>{LEGAL.site} is non-custodial.</strong> Payments move directly from the buyer&rsquo;s wallet to the seller&rsquo;s
        wallet (or to a seller&rsquo;s smart contract) under the buyer&rsquo;s own signed authorization. We never hold, control or
        transmit your funds, and we cannot reverse, refund or redirect a payment once it is settled on-chain. We are not a bank,
        money transmitter, payment processor, exchange, broker or custodian. See the <Link href="/disclaimer">Disclaimer</Link>.
      </p>

      <H>2. Eligibility</H>
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract.</li>
        <li>You may not use the Service if you are located in, or a national or resident of, a country or region subject to comprehensive sanctions, or if you are on any sanctions list maintained by the United States, the United Nations, the European Union or the United Kingdom.</li>
        <li>If you use the Service for an organization, you confirm you are authorized to bind it to these Terms.</li>
        <li>You are responsible for complying with the laws that apply to you, including any rules on accepting or paying with stablecoins.</li>
      </ul>

      <H>3. Wallets and sign-in</H>
      <p>
        You access the Service with a self-custodied crypto wallet. You are solely responsible for your wallet, its keys and
        everything signed with it. Signing in is a free message signature that proves control of an address; it does not move
        funds. Anyone who controls your wallet can act as you on the Service.
      </p>

      <H>4. Sellers</H>
      <p>If you list a service, you agree that:</p>
      <ul>
        <li>You own or have the right to sell access to the API, data, content or on-chain product you list, and doing so does not infringe anyone&rsquo;s rights or break any law or third-party terms.</li>
        <li>Your listing is accurate, including its description, price and payout wallet, and you keep it accurate.</li>
        <li>You are solely responsible for the service you provide, its uptime, its responses and any support, refunds or disputes with buyers.</li>
        <li>You are responsible for your own taxes, accounting and regulatory obligations arising from payments you receive.</li>
        <li>You will protect your upstream secret header and reject calls that do not carry it if you want your paywall enforced.</li>
        <li>We may review, pause, hide or remove any listing at any time, with or without notice, including for suspected abuse, fraud, legal risk or a breach of these Terms.</li>
      </ul>

      <H>5. Buyers</H>
      <ul>
        <li>Before you sign, the Service shows the exact price, token, network and recipient. A signed authorization lets that exact amount move once, to that recipient, before it expires.</li>
        <li>For API listings, the payment is settled only after the seller&rsquo;s service responds successfully. If the service fails or times out, the authorization is not used and you are not charged.</li>
        <li>For on-chain listings (for example, name registration), payment and delivery happen in a single transaction: either both succeed or neither does.</li>
        <li>Settled payments are final. Any request for a refund or remedy is between you and the seller.</li>
      </ul>

      <H>6. Fees</H>
      <p>
        Listing a service is free and {LEGAL.site} currently takes no percentage of payments. {LEGAL.site} pays the network fee
        (gas) to settle payments; to keep this sustainable, paid calls have a minimum price of $0.01. The only optional paid step
        offered in the listing flow is registering an x402 Identity name, which is a separate third-party service with its own
        price, paid on Ethereum. We may introduce or change fees for future use; changes will not apply to payments already made.
      </p>

      <H>7. Identity names and Verified Payee</H>
      <p>
        x402 Identity names are ENS names issued by a third-party registrar. Registering, renewing and managing a name is subject
        to that registrar&rsquo;s and ENS&rsquo;s terms. A <strong>Verified payee</strong> badge means only that, when checked,
        the named ENS records listed this service&rsquo;s address and payout wallet. It is not an endorsement, an audit or a
        statement about the seller&rsquo;s identity, quality or legality.
      </p>

      <H>8. Prohibited use</H>
      <p>You may not use the Service to:</p>
      <ul>
        <li>sell or buy anything illegal, or facilitate fraud, money laundering, terrorist financing, sanctions evasion or other financial crime;</li>
        <li>infringe intellectual property or privacy rights, or distribute malware or harmful content;</li>
        <li>impersonate any person or organization, or misrepresent who receives payment;</li>
        <li>attack, overload, scan or interfere with the Service, other users or any upstream service, including using the gateway to reach networks you are not authorized to access;</li>
        <li>drain or abuse the gas we pay for settlement, or otherwise game the Service&rsquo;s economics;</li>
        <li>scrape, copy or resell the Service except through its public interfaces.</li>
      </ul>

      <H>9. Third-party services</H>
      <p>
        The Service relies on third parties we do not control, including Robinhood Chain, the USDG stablecoin issued by Paxos,
        Ethereum and ENS, wallet providers and WalletConnect/Reown, RPC providers and Cloudflare. Their availability, behavior and
        terms are their own. We are not responsible for them.
      </p>

      <H>10. Intellectual property</H>
      <p>
        The Service, its software, design and content belong to us or our licensors, except for content you submit. You keep
        ownership of your listing content and grant us a worldwide, non-exclusive, royalty-free license to host, display, index
        and distribute it (including in the public discovery feed) to operate and promote the Service.
      </p>

      <H>11. Disclaimers</H>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
        IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. We do not warrant that
        the Service will be uninterrupted, error-free or secure, or that any listing is accurate, lawful or available. Blockchain
        transactions are irreversible and smart contracts may contain bugs. See the <Link href="/disclaimer">Disclaimer</Link>.
      </p>

      <H>12. Limitation of liability</H>
      <p>
        TO THE FULLEST EXTENT PERMITTED BY LAW, {LEGAL.entity.toUpperCase()} AND ITS MEMBERS, OFFICERS, EMPLOYEES AND AGENTS WILL NOT BE LIABLE
        FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE,
        DATA, DIGITAL ASSETS OR GOODWILL, ARISING FROM OR RELATED TO THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM
        OR RELATED TO THE SERVICE WILL NOT EXCEED ONE HUNDRED U.S. DOLLARS (US$100). Some jurisdictions do not allow certain
        limitations, so some of these may not apply to you.
      </p>

      <H>13. Indemnity</H>
      <p>
        You will defend, indemnify and hold harmless {LEGAL.entity} from any claims, losses and expenses (including reasonable
        legal fees) arising from your listings, your services, your use of the Service or your breach of these Terms or any law.
      </p>

      <H>14. Suspension and termination</H>
      <p>
        You may stop using the Service at any time and may pause or delist your services from the dashboard. We may suspend or
        end your access, or remove listings, at any time. Records of payments already settled on-chain cannot be removed from
        the blockchain. Sections that by their nature should survive termination will survive.
      </p>

      <H>15. Governing law and disputes</H>
      <p>
        These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-laws rules. Any
        dispute arising from or relating to these Terms or the Service will be brought exclusively in the state or federal
        courts located in Delaware, and you consent to their jurisdiction. Before filing a claim, you agree to contact us at{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> and try in good faith to resolve it informally for 30 days.
      </p>

      <H>16. Changes</H>
      <p>
        We may update these Terms. We will change the effective date above, and material changes will be posted on the Service.
        Continued use after changes take effect means you accept them.
      </p>

      <H>17. Contact</H>
      <p>
        {LEGAL.entity} · <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>
    </LegalPage>
  );
}
