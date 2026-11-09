#!/usr/bin/env node
// Usage: node scripts/seed-demo.mjs <payToAddress> [--remote]
// Creates the built-in demo listing ("internal:demo" upstream) at $0.01 per call.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const [payTo, flag] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(payTo ?? "")) {
  console.error("Pass the demo payout address: node scripts/seed-demo.mjs 0x… [--remote]");
  process.exit(1);
}
const now = Math.floor(Date.now() / 1000);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `
INSERT INTO sellers (address, org_name, created_at) VALUES (${q(payTo)}, 'x402Fi', ${now}) ON CONFLICT DO NOTHING;
INSERT INTO listings (id, slug, seller, name, summary, description, category, upstream_url, method, price_atomic, pay_to, identity_name, upstream_secret, example_request, example_response, status, created_at, updated_at)
VALUES (${q(randomUUID())}, 'demo-quote', ${q(payTo)}, 'x402Fi demo: paid hello',
  'A cent buys a signed hello. The fastest way to see x402 work end to end.',
  ${q("Built-in demo run by x402Fi. Pay $0.01 in USDG on Robinhood Chain and get a JSON response that names the paying wallet.\n\nUse it to test an agent, a wallet, or your finance export.")},
  'Developer tools', 'internal:demo', 'GET', '10000', ${q(payTo)}, NULL, ${q(randomBytes(24).toString("hex"))},
  '?symbol=USDG', ${q(JSON.stringify({ symbol: "USDG", message: "Paid response delivered by x402Fi.", paidBy: "0x…", servedAt: "2026-11-08T12:00:00.000Z" }, null, 2))},
  'live', ${now}, ${now})
ON CONFLICT(slug) DO NOTHING;`;
execFileSync("npx", ["wrangler", "d1", "execute", "x402fi", flag === "--remote" ? "--remote" : "--local", "--command", sql], { stdio: "inherit" });
