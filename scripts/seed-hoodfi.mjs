#!/usr/bin/env node
// Usage: node scripts/seed-hoodfi.mjs [--remote]
// Lists HoodFi Names' wallet lookup as a paid x402Fi service.
// Payout and seller: the HoodFi Safe (2-of-3), which exists on Robinhood Chain.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const SAFE = "0x837Fa2d033f1F7275452D780a5E54Eda903C1330";
const flag = process.argv[2];
const now = Math.floor(Date.now() / 1000);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const description = `Look up every HoodFi name a wallet holds on Robinhood Chain.

Call /<wallet address>/names. The response lists each name with its node, the address it resolves to, whether it resolves, and its avatar, plus the wallet's primary name when one is set.

HoodFi issues ENS names under hoodfi.eth as lifetime NFTs on Robinhood Chain. Ownership is read from the chain at request time (cached for up to 60 seconds).

Payments go to the HoodFi Safe (2-of-3 multisig).`;

const exampleResponse = JSON.stringify(
  {
    address: SAFE,
    primary: null,
    primarySource: null,
    names: [{ name: "hoodfi.eth", node: "0xb0980c3d…ea413", addr: null, resolves: false, avatar: null }],
  },
  null,
  2,
);

const sql = `
INSERT INTO sellers (address, org_name, created_at) VALUES (${q(SAFE)}, 'HoodFi', ${now}) ON CONFLICT DO NOTHING;
INSERT INTO listings (id, slug, seller, name, summary, description, category, upstream_url, method, price_atomic, pay_to, identity_name, upstream_secret, example_request, example_response, status, created_at, updated_at)
VALUES (${q(randomUUID())}, 'hoodfi-names', ${q(SAFE)}, 'HoodFi Names: wallet lookup',
  'Every HoodFi name a wallet holds on Robinhood Chain, with where each one resolves.',
  ${q(description)}, 'Data feeds', 'https://ccip.hoodfi-mcp.com/owner', 'GET', '1000', ${q(SAFE)}, NULL,
  ${q(randomBytes(24).toString("hex"))}, ${q(`/${SAFE}/names`)}, ${q(exampleResponse)}, 'live', ${now}, ${now})
ON CONFLICT(slug) DO NOTHING;`;

execFileSync("npx", ["wrangler", "d1", "execute", "x402fi", flag === "--remote" ? "--remote" : "--local", "--command", sql], { stdio: "inherit" });
