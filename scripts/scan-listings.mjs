#!/usr/bin/env node
// Usage: node scripts/scan-listings.mjs [--remote]
// READ-ONLY report: scans every listing's and endpoint's seller-written text with
// AgentWormhole's quote-text rules (the same scan the app runs on writes) and prints
// the result per listing, plus the scan the app last stored (text_scan), if any.
// Native endpoints' own 402 descriptions are not fetched here; the app scans those.
import { execFileSync } from "node:child_process";
import { inspectQuoteText } from "wormhole-x402/quotetext";

const where = process.argv.includes("--remote") ? "--remote" : "--local";
const query = (sql) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "x402fi", where, "--json", "--command", sql], { encoding: "utf8" });
  return JSON.parse(out)[0].results;
};

// text_scan arrives with migration 0005; report without it on a database that predates it.
const hasScan = query("PRAGMA table_info(listings)").some((c) => c.name === "text_scan");
const ls = query(`SELECT id, slug, status, name, summary, description, example_request, example_response${hasScan ? ", text_scan" : ""} FROM listings ORDER BY created_at`);
const ss = query("SELECT listing_id, method, path, name, summary, example_body, example_request, example_response FROM services");

let flagged = 0;
for (const l of ls) {
  const fields = {
    "listing.name": l.name, "listing.summary": l.summary, "listing.description": l.description,
    "listing.exampleRequest": l.example_request, "listing.exampleResponse": l.example_response,
  };
  for (const s of ss.filter((x) => x.listing_id === l.id)) {
    const at = `service[${s.method} ${s.path}]`;
    Object.assign(fields, {
      [`${at}.name`]: s.name, [`${at}.summary`]: s.summary, [`${at}.exampleBody`]: s.example_body,
      [`${at}.exampleRequest`]: s.example_request, [`${at}.exampleResponse`]: s.example_response,
    });
  }
  const hits = [];
  let decision = "allow";
  for (const [field, text] of Object.entries(fields)) {
    // wrangler --json prints SQL NULL as the string "null".
    if (typeof text !== "string" || !text.trim() || text === "null") continue;
    const v = inspectQuoteText(text);
    if (v.decision === "refuse") decision = "refuse";
    else if (v.decision === "abstain" && decision === "allow") decision = "abstain";
    for (const f of v.findings) hits.push(`    ${f.code} ${f.severity} ${field}: ${JSON.stringify(f.excerpt ?? "").slice(0, 120)}`);
    if (v.decision === "abstain") hits.push(`    ABSTAIN ${field}: ${v.reason}`);
  }
  let stored = "none";
  if (l.text_scan && l.text_scan !== "null") {
    try { stored = JSON.parse(l.text_scan).decision; } catch { stored = "unreadable"; }
  }
  if (decision !== "allow") flagged++;
  console.log(`${decision.padEnd(7)} ${l.slug} (${l.status}) stored=${stored}`);
  for (const h of hits) console.log(h);
}
console.log(`\n${ls.length} listings, ${flagged} flagged (${where.slice(2)})`);
