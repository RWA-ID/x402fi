import type { Metadata } from "next";
import { USDG } from "@/lib/chains";

export const metadata: Metadata = { title: "Developers", description: "x402 facilitator for Robinhood Chain, discovery feed, integration snippets, and how agents pay safely." };

const verifySecret = `// Your API, behind the x402Fi gateway: reject calls that skip the paywall.
app.use((req, res, next) => {
  if (req.get("x-x402fi-secret") !== process.env.X402FI_SECRET) return res.status(403).end();
  // Optional: who paid for this call
  req.payer = req.get("x-x402fi-payer");
  next();
});`;

const selfHost = `// Self-hosted paywall that uses the x402Fi facilitator (Robinhood Chain, USDG).
const FACILITATOR = "https://x402fi.dev/api/facilitator";
const requirements = {
  scheme: "exact",
  network: "eip155:4663",
  amount: "10000",                      // 0.01 USDG (6 decimals); x402Fi minimum
  asset: "${USDG.address}",
  payTo: "0xYourWallet",
  maxTimeoutSeconds: 120,
  extra: { name: "${USDG.eip712.name}", version: "${USDG.eip712.version}" },
};

app.get("/rates", async (req, res) => {
  const header = req.get("payment-signature") ?? req.get("x-payment");
  if (!header) {
    const pr = { x402Version: 2, resource: { url: req.url, description: "FX rates", mimeType: "application/json" }, accepts: [requirements] };
    return res.status(402).set("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(pr)).toString("base64")).json(pr);
  }
  const paymentPayload = JSON.parse(Buffer.from(header, "base64").toString());
  const body = JSON.stringify({ paymentPayload, paymentRequirements: requirements });
  const v = await fetch(FACILITATOR + "/verify", { method: "POST", headers: { "content-type": "application/json" }, body }).then(r => r.json());
  if (!v.isValid) return res.status(402).json({ error: v.invalidReason });

  const data = await computeRates();                         // do the work
  const s = await fetch(FACILITATOR + "/settle", { method: "POST", headers: { "content-type": "application/json" }, body }).then(r => r.json());
  if (!s.success) return res.status(402).json({ error: s.errorReason });
  res.set("PAYMENT-RESPONSE", Buffer.from(JSON.stringify(s)).toString("base64")).json(data);
});`;

// Kept in step with scripts/pay-guarded.mjs and test/buyer-guard.test.ts (which runs this recipe offline).
const guardedPay = `// npm install wormhole-x402 viem
import { evmQuoteFromRequirements, guardEvmSigner } from "wormhole-x402/evm";
import { inspectQuoteText } from "wormhole-x402/quotetext";

const USDG = "${USDG.address}";

// 1. Get the price. A 402 is the seller's text: scan it before a model reads it.
const pr = await (await fetch(url)).json();                 // HTTP 402
if (inspectQuoteText(pr).decision !== "allow") throw new Error("402 carries injected text");
const req = pr.accepts.find((a) => a.network === "eip155:4663");

// 2. Sign only through the guard. The quote comes from the 402, never from the model;
//    the cap comes from you. Any other payee, amount, token or chain, a long-lived
//    authorization, or any other signing request is refused.
const wallet = guardEvmSigner(account, () => evmQuoteFromRequirements(req), {
  spendPolicy: {
    maxPerPayment: { [USDG]: "50000" },     // $0.05 per call
    maxTotal:      { [USDG]: "5000000" },   // $5 over this wallet guard's life
  },
});
const now = BigInt(Math.floor(Date.now() / 1000));
const signature = await wallet.signTypedData({
  domain: { name: req.extra.name, version: req.extra.version, chainId: 4663, verifyingContract: req.asset },
  types: { TransferWithAuthorization: [ /* from, to, value, validAfter, validBefore, nonce */ ] },
  primaryType: "TransferWithAuthorization",
  message: { from: account.address, to: req.payTo, value: BigInt(req.amount),
             validAfter: now - 60n, validBefore: now + BigInt(req.maxTimeoutSeconds), nonce },
});

// 3. Pay: the same request, with the signed authorization.
const res = await fetch(url, { headers: { "PAYMENT-SIGNATURE": base64(JSON.stringify(
  { x402Version: 2, resource: pr.resource, accepted: req, payload: { signature, authorization } })) } });

// 4. Check what arrived before the model reads it.
const bytes = new Uint8Array(await res.arrayBuffer());
if (sha256hex(bytes) !== res.headers.get("x-x402fi-response-sha256")) throw new Error("not the response on the receipt");
const text = new TextDecoder().decode(bytes);
const body = (() => { try { return JSON.parse(text); } catch { return text; } })();
if (inspectQuoteText(body).decision === "refuse") throw new Error("paid response carries injected text");`;

const payeeExt = `// Name the payee in your 402 so agents can verify you (x402 payee-name extension)
"extensions": { "payee-name": { "info": { "name": "yourco.402api.eth" } } }

// Agents check it with:
import { verifyPayee, viemReader } from "@x402identity/payee";
const verdicts = await verifyPayee(paymentRequired, origin, viemReader(mainnetClient));`;

export default function Developers() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-14 sm:px-6">
      <p className="eyebrow">Developers</p>
      <h1 className="display mt-3 text-5xl sm:text-6xl">x402 on Robinhood Chain, <span className="italic">open.</span></h1>
      <p className="mt-5 text-lg text-ink-2">
        The no-code gateway covers most sellers. If you run your own server, use the same public facilitator and discovery feed. Building an agent that pays? Start with <a className="underline" href="#paying-safely">paying safely</a>.
      </p>
      <a
        href="https://github.com/RWA-ID/x402fi"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-2 hover:border-ink-3 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
        x402Fi is open source (Apache-2.0): RWA-ID/x402fi
      </a>

      <Section id="gateway" title="Behind the gateway">
        <p>Paid calls reach your API with two extra headers: <code className="font-mono">X-X402Fi-Secret</code> (from your listing) and <code className="font-mono">X-X402Fi-Payer</code>. Check the secret so the paywall can&apos;t be bypassed.</p>
        <Code>{verifySecret}</Code>
      </Section>

      <Section id="facilitator" title="Facilitator">
        <p>x402 v2, scheme <code className="font-mono">exact</code>, network <code className="font-mono">eip155:4663</code>, asset USDG. x402Fi pays the gas for settlement and never holds funds.</p>
        <ul className="mt-3 space-y-1 font-mono text-sm">
          <li>POST /api/facilitator/verify</li>
          <li>POST /api/facilitator/settle</li>
          <li>GET  /api/facilitator/supported</li>
        </ul>
        <Code>{selfHost}</Code>
      </Section>

      <Section id="paying-safely" title="Paying safely (for agents)">
        <p>
          An agent that pays per call is spending real money on text written by strangers. Four checks keep it honest, using{" "}
          <a className="underline" href="https://github.com/runningoffcode/agent-wormhole/tree/main/x402-guard" target="_blank" rel="noopener noreferrer">wormhole-x402</a>{" "}
          by AgentWormhole: open source, offline, and Robinhood Chain USDG is in its trusted domains.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5">
          <li><strong className="text-ink">Scan the 402 before a model reads it.</strong> Descriptions are written by the seller and can carry instructions aimed at your agent.</li>
          <li><strong className="text-ink">Sign only through the guard.</strong> <code className="font-mono">guardEvmSigner</code> wraps your wallet so that the only thing it signs is the payment the 402 asked for: the quoted payee, amount, token and chain, for a short window. Everything else it refuses, including approvals and permits.</li>
          <li><strong className="text-ink">Set a spending cap.</strong> If the seller is the attacker, a matching payment can still be for your whole balance. <code className="font-mono">spendPolicy</code> is the one control that needs your numbers, so it is off until you set it.</li>
          <li><strong className="text-ink">Check what arrived.</strong> x402Fi puts the SHA-256 of every paid response on its receipt and in <code className="font-mono">X-X402Fi-Response-SHA256</code>; compare it with the bytes you got, and scan the text before your agent trusts it because it paid.</li>
        </ol>
        <Code>{guardedPay}</Code>
        <p className="mt-3 text-sm">
          The complete, runnable version is{" "}
          <a className="font-mono underline" href="https://github.com/RWA-ID/x402fi/blob/main/scripts/pay-guarded.mjs" target="_blank" rel="noopener noreferrer">scripts/pay-guarded.mjs</a>
          , and{" "}
          <a className="font-mono underline" href="https://github.com/RWA-ID/x402fi/blob/main/test/buyer-guard.test.ts" target="_blank" rel="noopener noreferrer">test/buyer-guard.test.ts</a>{" "}
          runs this recipe against x402Fi&apos;s own 402s, including the payments it must refuse.
        </p>
        <p className="mt-3 text-sm">
          Scan JSON responses as parsed values, as above: the scanner treats quoted text as someone describing an attack rather than making one, and in raw JSON every value is quoted.
          A clean scan catches careless injections; it does not prove a seller is honest. The guard and the cap are what hold.
          To check <em>who</em> you are paying, add the <a className="underline" href="#payee">verified payee</a> check.
        </p>
      </Section>

      <Section id="discovery" title="Discovery">
        <p>Every paid endpoint is published in a Bazaar-style feed that agents and indexers can crawl: <a className="font-mono underline" href="/api/discovery/resources">/api/discovery/resources</a> (JSON), with a readable view at <a className="underline" href="/discovery">/discovery</a>.</p>
      </Section>

      <Section id="payee" title="Verified payee">
        <Code>{payeeExt}</Code>
        <p className="mt-3">Spec: <a className="underline" href="https://github.com/RWA-ID/x402-Identity/blob/main/specs/extensions/payee-name.md">payee-name extension</a>. Records: <code className="font-mono">org.x402.origins</code> and the Robinhood Chain address (coin type 2147488311).</p>
      </Section>

      <Section id="usdg" title="USDG details">
        <dl className="grid gap-2 font-mono text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-ink-3">Address</dt><dd className="break-all">{USDG.address}</dd>
          <dt className="text-ink-3">Decimals</dt><dd>{USDG.decimals}</dd>
          <dt className="text-ink-3">EIP-712 domain</dt><dd>name &quot;{USDG.eip712.name}&quot;, version &quot;{USDG.eip712.version}&quot;, chainId 4663</dd>
          <dt className="text-ink-3">Transfer</dt><dd>transferWithAuthorization (EIP-3009, v/r/s)</dd>
        </dl>
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-24 text-ink-2">
      <h2 className="display mb-4 text-4xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-lg bg-forest p-4 font-mono text-[0.78rem] leading-relaxed text-forest-ink">{children}</pre>;
}
