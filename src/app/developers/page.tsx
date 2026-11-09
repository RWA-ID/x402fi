import type { Metadata } from "next";
import { USDG } from "@/lib/chains";

export const metadata: Metadata = { title: "Developers", description: "x402 facilitator for Robinhood Chain, discovery feed and integration snippets." };

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
        The no-code gateway covers most sellers. If you run your own server, use the same public facilitator and discovery feed.
      </p>

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
