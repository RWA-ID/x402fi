# Security policy

x402Fi handles real payments: buyers sign USDG transfers on Robinhood Chain, and x402Fi's gateway and facilitator settle them. If you find a way to break that, please tell us privately first.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a vulnerability.**

- **Preferred:** GitHub private vulnerability reporting. Open the repository's **Security** tab and choose **Report a vulnerability**.
- **Or email:** [contact@x402fi.dev](mailto:contact@x402fi.dev), with "Security" in the subject.

Helpful to include: what you found, the steps or a minimal script to reproduce it, the affected URL or file, and what an attacker could gain. Use test amounts and your own wallet for any payment you send (see the rules below).

## What to expect

- **Acknowledgement** within 3 business days.
- **Initial assessment** (whether we can reproduce it, and its severity) within 7 business days.
- **Updates** as we work on a fix, and a coordinated disclosure date agreed with you once it is fixed.
- **Credit** in the fix's release notes or advisory, if you want it, under the name you choose.

There is **no bug bounty** at this time. We are grateful for every report, and say so publicly when you'd like us to.

## Scope

In scope, in this repository and on [x402fi.dev](https://x402fi.dev):

- **Gateway** (`/g/<listing>/…`): pricing, payment verification, the order of forwarding and settlement, replay protection, daily caps, upstream request handling (including SSRF), and the `X-X402Fi-Secret` header that lets sellers reject calls that skip the paywall.
- **Facilitator** (`/api/facilitator/verify`, `/settle`, `/supported`).
- **Settlement**: anything that makes x402Fi settle a payment it should not, settle twice, settle to the wrong address, or spend its gas wallet beyond what a payment needs.
- **Seller accounts**: wallet sign-in and sessions, and the listing and endpoint APIs (one seller changing another's listing, payout address or secret).
- **Receipts and exports**: receipt pages, the payment ledger, the CSV export, and the response hash on receipts.
- **Listing and response checks**: the listing text scan and the paid-response check (see the note below).
- **Native and contract listings**: the probe of a seller's own x402 endpoint, and the contract pricing mode.

Out of scope:

- **Smart contracts not in this repository**, including the HoodFi registrar contracts (`HoodfiX402Registrar` and others). Report those to the [HoodFi repository](https://github.com/RWA-ID/hoodfi-eth) instead.
- **Third-party services**: Robinhood Chain, the USDG token, Cloudflare, RPC providers, wallets, ENS, and sellers' own APIs. Report a bug in one of those to its maintainer.
- **Issues that need a seller's own upstream secret**, session or wallet key, or physical or administrative access to a user's device.
- **Denial of service** by volume, and findings from automated scanners without a demonstrated impact.
- **Missing best-practice headers or settings** without a concrete attack.

### A note on the text checks

The listing text scan and the paid-response check use AgentWormhole's [wormhole-x402](https://github.com/runningoffcode/agent-wormhole) rules. They match the shape of an injection, so rewording can evade them, and they are not a security boundary: an evasion on its own is not a vulnerability here. Evasions are still useful to us, though, so send them. We will pass them on to AgentWormhole, or you can report them there directly (their SECURITY.md asks for that privately too). What *is* in scope is the check failing to run, or reporting "checked" on content it did not read.

## Rules for testing

Good-faith research within these rules is welcome, and we will not pursue it legally:

- **Use your own wallet and test amounts.** Pay only listings you control or the built-in `demo-quote` listing ($0.01), and keep any payment you send at or below $0.10.
- **Do not touch other people's funds, listings, sessions or data.** If you reach any by accident, stop, don't keep or share it, and tell us.
- **No denial of service**, no load testing, and no spam through the listing wizard.
- **No social engineering** of sellers, buyers or Only Buy Bitcoin LLC staff.
- **Give us reasonable time to fix** an issue before disclosing it, and coordinate the date with us.

## How x402Fi is built (by design, not bugs)

These are deliberate. Reports that show one of them failing are very welcome. Reports that ask for them to be different are design discussions, and fine as public issues.

- **x402Fi never holds funds.** A buyer's signed EIP-3009 authorization moves USDG straight from the buyer to the seller's payout address. Contract-mode listings pay the listing's contract, which acts in the same transaction. x402Fi's hot wallet only pays gas, and holds ETH for that alone.
- **Settlement happens after the seller answers.** The gateway checks the payment, forwards the call, and settles only if the seller's API returned a success. A seller error is never charged.
- **Each authorization settles at most once.** The payment's nonce is claimed in the database before the call is forwarded, so a replayed authorization never reaches the seller twice.
- **Native listings are paid directly.** x402Fi lists them, and redirects buyers to the seller's own x402 endpoint, but never handles their payments.
- **Secrets live in Cloudflare.** Nothing secret is in this repository. If you find one, that is in scope; please report it privately.

## Supported versions

Only the current deployment at [x402fi.dev](https://x402fi.dev) and the `main` branch are supported.
