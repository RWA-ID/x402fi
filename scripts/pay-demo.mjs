#!/usr/bin/env node
// Pays one x402Fi endpoint from a local wallet and prints the result.
// A seller's own x402 v1 endpoint (a native listing) works too: it is paid with X-PAYMENT.
// Run it yourself:   node scripts/pay-demo.mjs [url] [envFile] [envVar]
// Defaults: the $0.01 demo, ~/hoodfi-eth/contracts/.env, PRIVATE_KEY.
// The key is read at run time and never printed. Refuses anything above $0.01.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createPublicClient, http, getAddress, toHex, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Test cap: $0.01 by default; raise per run with MAX_USDG=0.05 (6-dp USDG).
// POST endpoints: METHOD=POST BODY='{"hello":"world"}' (CONTENT_TYPE defaults to application/json).
const MAX_ATOMIC = BigInt(Math.round(Number(process.env.MAX_USDG ?? "0.01") * 1e6));
const url = process.argv[2] ?? "https://x402fi.dev/g/demo-quote?symbol=USDG";
const envFile = process.argv[3] ?? `${homedir()}/hoodfi-eth/contracts/.env`;
const envVar = process.argv[4] ?? "PRIVATE_KEY";
const method = (process.env.METHOD ?? "GET").toUpperCase();
const reqBody = method === "GET" || method === "HEAD" ? undefined : process.env.BODY ?? "{}";
const baseHeaders = reqBody === undefined ? {} : { "content-type": process.env.CONTENT_TYPE ?? "application/json" };

const m = readFileSync(envFile, "utf8").match(new RegExp(`^${envVar}=["']?(0x)?([0-9a-fA-F]{64})["']?\\s*$`, "m"));
if (!m) { console.error(`No ${envVar} in ${envFile}`); process.exit(1); }
const account = privateKeyToAccount(`0x${m[2]}`);

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const rh = createPublicClient({ transport: http("https://rpc.mainnet.chain.robinhood.com") });
const bal = await rh.readContract({ address: USDG, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [account.address] });
console.log(`payer        ${account.address}`);
console.log(`USDG before  ${Number(bal) / 1e6}`);

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64");
const first = await fetch(url, { method, headers: baseHeaders, body: reqBody });
if (first.status !== 402) { console.error(`expected 402, got ${first.status}: ${await first.text()}`); process.exit(1); }
const pr = await first.json();
const req = pr.accepts[0];
// x402 v1 (a seller's own endpoint): the amount is `maxAmountRequired`, the header X-PAYMENT.
const v1 = pr.x402Version === 1;
const amount = v1 ? req.maxAmountRequired : req.amount;
if (!amount || !/^\d+$/.test(amount)) { console.error(`no usable amount in the 402: ${JSON.stringify(req).slice(0, 300)}`); process.exit(1); }
// This script signs for USDG on Robinhood Chain only, whatever the 402 asks for.
if (getAddress(req.asset) !== USDG) { console.error(`refusing: the 402 asks for token ${req.asset}, not USDG`); process.exit(1); }
if (req.scheme !== "exact") { console.error(`refusing: scheme ${req.scheme}`); process.exit(1); }
if (BigInt(amount) > MAX_ATOMIC) { console.error(`refusing: price ${Number(amount) / 1e6} USDG is above the ${Number(MAX_ATOMIC) / 1e6} USDG test cap (set MAX_USDG to raise it)`); process.exit(1); }
console.log(`quote        ${Number(amount) / 1e6} USDG → ${req.payTo} on ${req.network}${v1 ? " (x402 v1)" : ""}`);

const message = {
  from: account.address, to: getAddress(req.payTo), value: BigInt(amount),
  // v1: no longer than the seller's own window.
  validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + (v1 && Number(req.maxTimeoutSeconds) > 0 ? Math.min(600, Number(req.maxTimeoutSeconds)) : 600)),
  nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
};
const signature = await account.signTypedData({
  domain: { name: req.extra.name, version: req.extra.version, chainId: 4663, verifyingContract: getAddress(req.asset) },
  types: { TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ] },
  primaryType: "TransferWithAuthorization",
  message,
});
const payload = { signature, authorization: { ...message, value: message.value.toString(), validAfter: "0", validBefore: message.validBefore.toString() } };
const payment = v1
  ? { x402Version: 1, scheme: req.scheme, network: req.network, payload }
  : { x402Version: 2, resource: pr.resource, accepted: req, payload };

const t0 = Date.now();
const paid = await fetch(url, { method, headers: { ...baseHeaders, [v1 ? "X-PAYMENT" : "PAYMENT-SIGNATURE"]: b64(payment) }, body: reqBody });
const body = await paid.text();
console.log(`status       ${paid.status} in ${Date.now() - t0} ms`);
const rcpt = paid.headers.get(v1 ? "x-payment-response" : "payment-response");
if (rcpt) {
  const s = JSON.parse(Buffer.from(rcpt, "base64").toString());
  const tx = s.transaction ?? s.txHash;
  console.log(`settled      ${s.success} tx ${tx}`);
  console.log(`explorer     https://robinhoodchain.blockscout.com/tx/${tx}`);
}
const r = paid.headers.get("x-x402fi-receipt");
if (r) console.log(`receipt      ${new URL(url).origin}${r}`);
console.log(`body         ${body.slice(0, 400)}`);
