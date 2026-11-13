#!/usr/bin/env node
// Pays one x402Fi endpoint from a local wallet and prints the result.
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
if (BigInt(req.amount) > MAX_ATOMIC) { console.error(`refusing: price ${Number(req.amount) / 1e6} USDG is above the ${Number(MAX_ATOMIC) / 1e6} USDG test cap (set MAX_USDG to raise it)`); process.exit(1); }
console.log(`quote        ${Number(req.amount) / 1e6} USDG → ${req.payTo} on ${req.network}`);

const message = {
  from: account.address, to: getAddress(req.payTo), value: BigInt(req.amount),
  validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + 600),
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
const payment = {
  x402Version: 2, resource: pr.resource, accepted: req,
  payload: { signature, authorization: { ...message, value: message.value.toString(), validAfter: "0", validBefore: message.validBefore.toString() } },
};

const t0 = Date.now();
const paid = await fetch(url, { method, headers: { ...baseHeaders, "PAYMENT-SIGNATURE": b64(payment) }, body: reqBody });
const body = await paid.text();
console.log(`status       ${paid.status} in ${Date.now() - t0} ms`);
const rcpt = paid.headers.get("payment-response");
if (rcpt) {
  const s = JSON.parse(Buffer.from(rcpt, "base64").toString());
  console.log(`settled      ${s.success} tx ${s.transaction}`);
  console.log(`explorer     https://robinhoodchain.blockscout.com/tx/${s.transaction}`);
}
const r = paid.headers.get("x-x402fi-receipt");
if (r) console.log(`receipt      ${new URL(url).origin}${r}`);
console.log(`body         ${body.slice(0, 400)}`);
