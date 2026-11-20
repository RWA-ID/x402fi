#!/usr/bin/env node
// Everything the /sell/new wizard does, from code: for agents whose wallet signs from code, not
// in a browser. Documented at https://x402fi.dev/developers#list-from-code.
//
//   SELLER_KEY=0x… node scripts/list-from-code.mjs listing.json
//   DRY_RUN=1 node scripts/list-from-code.mjs listing.json     (read-only checks: no sign-in, no payment, no transaction)
//
// listing.json is the publish body (see the docs) plus three optional steps:
//   "hoodfiName": { "label": "acme", "maxUsdg": "3" }   Name step: register acme.hoodfi.eth if needed, point it at the listing
//   "test": true                                          Test step: call each endpoint once, unpaid, before publishing
//   "review": { "contact": "@acme", "repoUrl": "https://github.com/…", "commit": "…", "note": "…" }   Review step, after publishing
// The publish body takes "logoUrl" (https:// or ipfs:// image), "websiteUrl" and "xHandle" too.
//
// One wallet does it all: it signs in, pays for the name (the name goes to the payer), owns the
// name and writes its records. The name costs USDG; its records cost a little ETH for gas on
// Robinhood Chain. Nothing here touches Ethereum mainnet. The key is never printed.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, getAddress, http, namehash, parseAbi, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { buildPayeeCalls, planPayeeRecords, textResolverAbi } from "@x402identity/widget-core";
import { evmQuoteFromRequirements, guardEvmSigner } from "wormhole-x402/evm";
import { inspectQuoteText } from "wormhole-x402/quotetext";

const X = (process.env.X402FI ?? "https://x402fi.dev").replace(/\/$/, "");
const DRY = process.env.DRY_RUN === "1";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const HOODFI_REGISTRY = "0xf2bABA012244bdD7445129597350054E1B3aEe5C"; // ERC-721 + resolver for *.hoodfi.eth
const NETWORK = "eip155:4663";
const robinhood = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } } });
const registryAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
  "function multicall(bytes[] data) returns (bytes[])",
]);

const spec = JSON.parse(readFileSync(process.argv[2] ?? "listing.json", "utf8"));
const { hoodfiName, test, review, ...listing } = spec;
const log = (step, msg) => console.log(`${step.padEnd(9)} ${msg}`);
const stop = (msg) => { console.error(`STOPPED   ${msg}`); process.exit(1); };
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { error: t.slice(0, 200) }; } };

const key = process.env.SELLER_KEY;
if (!DRY && !/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) stop("set SELLER_KEY=0x… (or DRY_RUN=1)");
const account = DRY ? null : privateKeyToAccount(key);
const rh = createPublicClient({ chain: robinhood, transport: http() });

// The origin a payee name must list: x402Fi's gateway, or the seller's own origin for a native listing.
const payeeOrigin = listing.native ? new URL(listing.upstreamUrl).origin : X;

// ---- 1. Sign in (SIWE, EIP-4361) --------------------------------------------------------
let cookie = "";
if (DRY) log("sign-in", "skipped (dry run)");
else {
  const { nonce } = await json(await fetch(`${X}/api/auth/nonce`));
  const message = createSiweMessage({
    domain: new URL(X).host, uri: X, version: "1", chainId: 1, address: account.address, nonce,
    statement: "Sign in to x402Fi. This does not cost anything or move funds.",
  });
  const r = await fetch(`${X}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature: await account.signMessage({ message }) }) });
  if (!r.ok) stop(`sign-in: ${(await json(r)).error}`);
  cookie = r.headers.get("set-cookie").split(";")[0];
  log("sign-in", `signed in as ${account.address}`);
}
const api = (path, init = {}) => fetch(`${X}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });

// ---- 2. Name (optional): a HoodFi name on Robinhood Chain ---------------------------------
if (hoodfiName) {
  const label = String(hoodfiName.label ?? "").toLowerCase();
  const name = `${label}.hoodfi.eth`;
  const node = namehash(name);
  const owner = await rh.readContract({ address: HOODFI_REGISTRY, abi: registryAbi, functionName: "ownerOf", args: [BigInt(node)] }).catch(() => null);

  if (!owner) {
    const s = await json(await fetch(`${X}/api/names/suggest?label=${encodeURIComponent(label)}`));
    const h = s.suggestions?.[0]?.hoodfi;
    if (s.suggestions?.[0]?.label !== label || h?.available !== true) stop(`${name} can't be registered: ${h?.reason ?? "not a valid label"}`);
    log("name", `${name} is available for ${Number(h.priceAtomic) / 1e6} USDG`);
    if (DRY) log("name", "not registered (dry run)");
    else {
      // Registering is an ordinary x402 purchase from the HoodFi Names listing. Signed through the
      // guard, capped at maxUsdg: it refuses any other payee, token, chain or a larger amount.
      const url = `${X}/g/hoodfi-names/register/${encodeURIComponent(label)}`;
      const first = await fetch(url, { method: "POST" });
      if (first.status !== 402) stop(`register: expected 402, got ${first.status}`);
      const pr = await first.json();
      if (inspectQuoteText(pr).decision !== "allow") stop("register: the 402 carries text aimed at the agent");
      const req = pr.accepts.find((a) => a.network === NETWORK && getAddress(a.asset) === getAddress(USDG));
      if (!req) stop("register: no USDG option in the 402");
      const cap = String(Math.round(Number(hoodfiName.maxUsdg ?? "3") * 1e6));
      const quote = evmQuoteFromRequirements(req);
      const wallet = guardEvmSigner(account, () => quote, { spendPolicy: { maxPerPayment: { [USDG]: cap }, maxTotal: { [USDG]: cap } } });
      const now = BigInt(Math.floor(Date.now() / 1000));
      const auth = { from: account.address, to: getAddress(req.payTo), value: BigInt(req.amount), validAfter: now - 60n, validBefore: now + BigInt(req.maxTimeoutSeconds ?? 120), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
      const signature = await wallet.signTypedData({
        domain: { name: req.extra.name, version: req.extra.version, chainId: 4663, verifyingContract: getAddress(req.asset) },
        types: { TransferWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        ] },
        primaryType: "TransferWithAuthorization",
        message: auth,
      }).catch((e) => stop(`register: the guard refused to sign (${e.message})`));
      const payload = { x402Version: 2, resource: pr.resource, accepted: req, payload: { signature, authorization: { ...auth, value: auth.value.toString(), validAfter: auth.validAfter.toString(), validBefore: auth.validBefore.toString() } } };
      const paid = await fetch(url, { method: "POST", headers: { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64") } });
      const body = await json(paid);
      if (!paid.ok) stop(`register: ${paid.status} ${JSON.stringify(body).slice(0, 200)}`);
      log("name", `registered ${body.name ?? name} (paid ${Number(req.amount) / 1e6} USDG)`);
    }
  } else if (!DRY && getAddress(owner) !== account.address) stop(`${name} belongs to ${owner}, not ${account.address}`);
  else log("name", `${name} already exists (owner ${owner})`);

  // Is it already set up for this listing? Same check as the wizard and the listing badge.
  const check = async () => json(await fetch(`${X}/api/names/check?${new URLSearchParams({ name, payTo: listing.payTo, ...(listing.native ? { upstream: listing.upstreamUrl } : {}) })}`, { headers: { cookie } }));
  let c = await check();
  if (c.error) stop(`name check: ${c.error}`);
  if (c.state === "verified") log("name", `${name} already points at this listing. Nothing to write.`);
  else if (DRY) log("name", `needs records (${c.reasonText ?? c.state}); not written (dry run)`);
  else {
    // One Robinhood Chain transaction on the HoodFi registry: org.x402.origins + the Robinhood
    // Chain address (= payTo) + org.x402.payto. Existing origins and payto entries are kept.
    const [origins, payto] = await Promise.all(["org.x402.origins", "org.x402.payto"].map((k) => rh.readContract({ address: HOODFI_REGISTRY, abi: registryAbi, functionName: "text", args: [node, k] })));
    const split = (s) => s.split(/\s+/).filter(Boolean);
    const plan = planPayeeRecords([...new Set([...split(origins), payeeOrigin])], [{ network: NETWORK, payTo: getAddress(listing.payTo) }]);
    plan.payto = [...new Set([...split(payto), ...plan.payto])];
    const calls = [...buildPayeeCalls(node, plan)];
    for (const [k, v] of Object.entries(hoodfiName.profile ?? {})) { // optional: { avatar, url, "com.twitter" }
      if (["avatar", "url", "com.twitter"].includes(k) && typeof v === "string" && v.trim()) calls.push(encodeFunctionData({ abi: textResolverAbi, functionName: "setText", args: [node, k, v.trim()] }));
    }
    const w = createWalletClient({ account, chain: robinhood, transport: http() });
    const hash = await w.writeContract({ address: HOODFI_REGISTRY, abi: registryAbi, functionName: "multicall", args: [calls] });
    const receipt = await rh.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") stop(`records: transaction ${hash} reverted`); // a revert does not throw
    log("name", `records written, tx ${hash}`);
    c = await check();
    if (c.state !== "verified") log("name", `written, but the check says ${c.state} (${c.reasonText ?? "try again in a minute"})`);
  }
  listing.identityName = name;
}

// ---- 3. Test (optional): call each endpoint once, unpaid ----------------------------------
if (test) {
  if (DRY) log("test", "skipped (needs a session)");
  else for (const ep of listing.endpoints ?? [{ method: listing.method ?? "GET", path: "/" }]) {
    // Same URL as the wizard's test (src/lib/wizard.ts upstreamFor): base + path + the example's path/query.
    const u = new URL(listing.upstreamUrl);
    const ex = (ep.exampleRequest ?? "").trim();
    const [exPath, exQuery] = ex.startsWith("/") ? ex.split("?") : ["", ex.startsWith("?") ? ex.slice(1) : ""];
    const p = !ep.path || ep.path === "/" ? "" : "/" + ep.path.replace(/^\/+|\/+$/g, "");
    u.pathname = (u.pathname.replace(/\/$/, "") + p + (exPath ?? "")) || "/";
    if (exQuery) new URLSearchParams(exQuery).forEach((v, k) => u.searchParams.append(k, v));
    const url = u.toString();
    const r = await json(await api("/api/listings/check-upstream", { method: "POST", body: JSON.stringify({ url, method: ep.method ?? "GET" }) }));
    log("test", `${ep.method ?? "GET"} ${url} → ${r.ok ? `${r.status} in ${r.ms} ms` : `FAILED: ${r.error ?? r.status}`}`);
  }
}

// ---- 4. Publish ------------------------------------------------------------------------------
if (DRY) { log("publish", "skipped (dry run)"); process.exit(0); }
const pub = await api("/api/listings", { method: "POST", body: JSON.stringify({ ...listing, publish: listing.publish ?? true }) });
const out = await json(pub);
if (!pub.ok) stop(`publish: ${JSON.stringify(out.errors ?? out.error)}`);
log("publish", `live at ${X}/market/${out.slug}`);
// Store it now: paid calls reach your API with it in X-X402Fi-Secret. (Rotate it later with
// PATCH /api/listings/{id} {"rotateSecret": true}.)
log("secret", out.upstreamSecret);

// ---- 5. Review (optional): ask HEY Research Lab to review the endpoints ----------------------
if (review) {
  const r = await api("/api/reviews", { method: "POST", body: JSON.stringify({ listingId: out.id, ...review }) });
  const j = await json(r);
  log("review", r.ok ? `requested for ${j.requested.length} endpoint(s)` : `not requested: ${JSON.stringify(j.errors ?? j.error)}`);
}
