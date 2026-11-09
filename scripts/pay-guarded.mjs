#!/usr/bin/env node
// The "Paying safely" recipe from /developers, end to end: pays one x402Fi endpoint
// through AgentWormhole's guard (wormhole-x402) and checks what came back.
// Run it yourself:   cd ~/x402fi && node --dns-result-order=ipv4first scripts/pay-guarded.mjs [url] [envFile] [envVar]
// Defaults: the $0.01 demo, ~/hoodfi-eth/contracts/.env, PRIVATE_KEY. The key is read at
// run time and never printed. The guard's spending cap refuses anything above $0.01.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { getAddress, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { evmQuoteFromRequirements, guardEvmSigner } from "wormhole-x402/evm";
import { inspectQuoteText } from "wormhole-x402/quotetext";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const url = process.argv[2] ?? "https://x402fi.dev/g/demo-quote?symbol=USDG";
const envFile = process.argv[3] ?? `${homedir()}/hoodfi-eth/contracts/.env`;
const envVar = process.argv[4] ?? "PRIVATE_KEY";
const m = readFileSync(envFile, "utf8").match(new RegExp(`^${envVar}=["']?(0x)?([0-9a-fA-F]{64})["']?\\s*$`, "m"));
if (!m) { console.error(`No ${envVar} in ${envFile}`); process.exit(1); }
const account = privateKeyToAccount(`0x${m[2]}`);
const stop = (msg) => { console.error(`STOPPED      ${msg}`); process.exit(1); };

// 1. Ask for the price. The 402 is the seller's text: scan it before any of it reaches a model.
const first = await fetch(url);
if (first.status !== 402) stop(`expected 402, got ${first.status}`);
const pr = await first.json();
const scan = inspectQuoteText(pr);
console.log(`402 text     ${scan.decision}${scan.findings.length ? " " + scan.findings.map((f) => f.code).join(",") : ""}`);
if (scan.decision !== "allow") stop("the 402 carries text aimed at the agent");
const req = pr.accepts.find((a) => a.network === "eip155:4663" && getAddress(a.asset) === getAddress(USDG));
if (!req) stop("no USDG on Robinhood Chain option in the 402");
console.log(`quote        ${Number(req.amount) / 1e6} USDG → ${req.payTo}`);

// 2. Sign ONLY through the guard. The quote comes from the 402 (never from the model), the cap
//    from us: the guard refuses any other payee, amount, token, chain, a long-lived window, and
//    any other signing request, and caps what one payment and the guard's lifetime can move.
const quote = evmQuoteFromRequirements(req);
const wallet = guardEvmSigner(account, () => quote, {
  spendPolicy: { maxPerPayment: { [USDG]: "10000" }, maxTotal: { [USDG]: "10000" } }, // $0.01, once
});
const now = BigInt(Math.floor(Date.now() / 1000));
const message = {
  from: account.address, to: getAddress(req.payTo), value: BigInt(req.amount),
  validAfter: now - 60n, validBefore: now + BigInt(req.maxTimeoutSeconds ?? 120),
  nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
};
let signature;
try {
  signature = await wallet.signTypedData({
    domain: { name: req.extra.name, version: req.extra.version, chainId: 4663, verifyingContract: getAddress(req.asset) },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    primaryType: "TransferWithAuthorization",
    message,
  });
} catch (e) {
  stop(`the guard refused to sign: ${e.message}`);
}
console.log(`guard        signed (payee, amount, token, chain, window and cap all checked)`);

// 3. Pay.
const payment = {
  x402Version: 2, resource: pr.resource, accepted: req,
  payload: { signature, authorization: { ...message, value: message.value.toString(), validAfter: message.validAfter.toString(), validBefore: message.validBefore.toString() } },
};
const paid = await fetch(url, { headers: { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payment)).toString("base64") } });
const bytes = new Uint8Array(await paid.arrayBuffer());
console.log(`status       ${paid.status}`);
const settled = paid.headers.get("payment-response");
if (settled) console.log(`settled      tx ${JSON.parse(Buffer.from(settled, "base64").toString()).transaction}`);
const receipt = paid.headers.get("x-x402fi-receipt");
if (receipt) console.log(`receipt      ${new URL(url).origin}${receipt}`);

// 4. Check what arrived. The hash must match the one x402Fi put on the receipt, and paid text
//    is scanned before the model reads it (as parsed JSON values: AgentWormhole's raw scan
//    downgrades anything inside JSON quotes).
const sha = createHash("sha256").update(bytes).digest("hex");
const claimed = paid.headers.get("x-x402fi-response-sha256");
console.log(`sha256       ${sha} ${claimed ? (claimed === sha ? "= receipt" : `!= receipt ${claimed}`) : "(no receipt hash)"}`);
const text = new TextDecoder().decode(bytes);
let body;
try { body = JSON.parse(text); } catch { body = text; }
const delivered = inspectQuoteText(body);
console.log(`response     ${delivered.decision}${delivered.findings.length ? " " + delivered.findings.map((f) => f.code).join(",") : ""}`);
if (claimed && claimed !== sha) stop("the response is not the one on the receipt");
if (delivered.decision === "refuse") stop("the paid response carries text aimed at the agent: do not hand it to the model");
console.log(`body         ${text.slice(0, 400)}`);
