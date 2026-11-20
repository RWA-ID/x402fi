/**
 * The Robinhood Stock Token list for Try it's ticker search: [{ s, n, a, i? }].
 * Robinhood's API sends no CORS headers, so the browser asks us. Cached in the isolate for
 * 10 minutes (a stale copy is served for up to a day if Robinhood is down) and at the edge.
 */
import { ROBINHOOD_ASSETS_API, slimAssets, type StockToken } from "@/lib/stock-tokens";

// Fetched per request (then cached above), never frozen into the build.
export const dynamic = "force-dynamic";

const TTL = 10 * 60_000;
const STALE_OK = 24 * 60 * 60_000;
let memo: { at: number; list: StockToken[] } | null = null;
let inflight: Promise<StockToken[]> | null = null;

async function load(): Promise<StockToken[]> {
  const r = await fetch(`${ROBINHOOD_ASSETS_API}/assets`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`rhj/assets ${r.status}`);
  return slimAssets(await r.json());
}

export async function GET() {
  const now = Date.now();
  if (!memo || now - memo.at > TTL) {
    try {
      inflight ??= load().finally(() => { inflight = null; });
      memo = { at: now, list: await inflight };
    } catch {
      if (!memo || now - memo.at > STALE_OK) return Response.json({ error: "The stock token list is unavailable right now." }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  return Response.json(memo.list, { headers: { "cache-control": "public, max-age=300, s-maxage=600" } });
}
