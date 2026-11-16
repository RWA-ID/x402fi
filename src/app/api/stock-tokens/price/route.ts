/**
 * Live bid/ask for one Stock Token, for Try it's price line: ?symbol=AAPL.
 * Robinhood's raw underlying-equity price (not multiplier-adjusted). Their documented cache
 * window is 15 s, so we hold each symbol that long.
 */
import { ROBINHOOD_ASSETS_API, SYMBOL, slimPrice, type StockPrice } from "@/lib/stock-tokens";

export const dynamic = "force-dynamic";

const TTL = 15_000;
const memo = new Map<string, { at: number; price: StockPrice | null }>();

export async function GET(req: Request) {
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!SYMBOL.test(symbol)) return Response.json({ error: "Pass ?symbol= with a ticker like AAPL." }, { status: 400 });
  const now = Date.now();
  let hit = memo.get(symbol);
  if (!hit || now - hit.at > TTL) {
    const r = await fetch(`${ROBINHOOD_ASSETS_API}/prices/${encodeURIComponent(symbol)}`, { headers: { accept: "application/json" } }).catch(() => null);
    if (!r || (!r.ok && r.status !== 404)) return Response.json({ error: "Price unavailable right now." }, { status: 503, headers: { "cache-control": "no-store" } });
    hit = { at: now, price: r.status === 404 ? null : slimPrice(await r.json().catch(() => null)) };
    if (memo.size > 500) memo.clear();
    memo.set(symbol, hit);
  }
  if (!hit.price) return Response.json({ error: "No price for that ticker." }, { status: 404, headers: { "cache-control": "public, max-age=60" } });
  return Response.json(hit.price, { headers: { "cache-control": "public, max-age=15" } });
}
