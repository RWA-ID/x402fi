/**
 * Robinhood Stock Tokens for Try it: the ticker search, ticker → contract address, and logos.
 * The list comes from Robinhood's public asset API through /api/stock-tokens (the API sends
 * no CORS headers, so browsers cannot call it directly).
 *
 * Pure: shared by the API routes, the Try it picker and the tests.
 */

export interface StockToken {
  /** Ticker, e.g. "AAPL". */
  s: string;
  /** Company or fund name, without Robinhood's " • Robinhood Token" suffix. */
  n: string;
  /** EIP-55 contract address on Robinhood Chain. */
  a: string;
  /** ISIN, when Robinhood lists one. Used for the logo. */
  i?: string;
}

export interface StockPrice {
  symbol: string;
  bid: string;
  ask: string;
  halted: boolean;
  at: string;
}

export const ROBINHOOD_ASSETS_API = "https://api.robinhood.com/rhj";
const ROBINHOOD_CHAIN_ID = 4663;

/** The quick-pick chips shown above a ticker search. */
export const QUICK_PICKS = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "SPY"];

/**
 * Brandfetch Logo API client ID. A public, browser-side key: Brandfetch only serves logos
 * hotlinked from a real browser (scripts get `x-bf-error: automated_traffic`), so it cannot
 * be proxied or cached by us. Robinhood's own `logoUrl` is one placeholder for every token.
 */
export const BRANDFETCH_CLIENT_ID = "1idCGSZnaFL2hkG7DtD";

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/**
 * Logo by ISIN when there is one, else by ticker. Brandfetch's ticker lookup returns a BLANK
 * image (not an error, so onError never fires) for tickers it has not mapped yet, e.g. a new
 * IPO like ANT on its first day, while the ISIN lookup already knows the company. Checked
 * 2026-11-19 across all 204 tokens: ISIN matched or beat the ticker logo on every one.
 */
export function logoUrl(token: { s: string; i?: string }): string {
  const path = token.i && ISIN.test(token.i) ? `isin/${token.i}` : `ticker/${encodeURIComponent(token.s)}`;
  return `https://cdn.brandfetch.io/${path}/w/64/h/64?c=${BRANDFETCH_CLIENT_ID}`;
}

export const SYMBOL = /^[A-Z0-9.]{1,12}$/;

/** Robinhood's /assets response → the slim list: active tokens deployed on Robinhood Chain, by ticker. */
export function slimAssets(json: unknown): StockToken[] {
  const assets = (json as { assets?: unknown })?.assets;
  if (!Array.isArray(assets)) throw new Error("rhj/assets: no assets array");
  const out: StockToken[] = [];
  for (const x of assets as Array<Record<string, unknown>>) {
    if (x.status !== "ASSET_STATUS_ACTIVE" || typeof x.tokenSymbol !== "string") continue;
    const dep = (x.deployments as Array<{ chainId?: number; contractAddress?: string }> | undefined)?.find((d) => d.chainId === ROBINHOOD_CHAIN_ID);
    if (!dep?.contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(dep.contractAddress)) continue;
    const name = typeof x.tokenName === "string" ? x.tokenName.replace(/\s*•\s*Robinhood Token\s*$/i, "").trim() : "";
    const isin = typeof x.isin === "string" ? x.isin.trim().toUpperCase() : "";
    out.push({ s: x.tokenSymbol.toUpperCase(), n: name || x.tokenSymbol, a: dep.contractAddress, ...(ISIN.test(isin) ? { i: isin } : {}) });
  }
  return out.sort((p, q) => p.s.localeCompare(q.s));
}

/** Robinhood's /prices/{symbol} response → the price line's fields, or null. */
export function slimPrice(json: unknown): StockPrice | null {
  const q = (json as { quotes?: Array<Record<string, unknown>> })?.quotes?.[0];
  if (!q || typeof q.tokenSymbol !== "string" || typeof q.bid !== "string" || typeof q.ask !== "string") return null;
  return { symbol: q.tokenSymbol, bid: q.bid, ask: q.ask, halted: q.isTradingHalt === true, at: typeof q.generatedAt === "string" ? q.generatedAt : "" };
}

/**
 * Best matches first: exact ticker, ticker prefix, a word of the name starting with the
 * query, then (3+ characters) the name containing it anywhere.
 */
export function searchTokens(list: StockToken[], query: string, limit = 8): StockToken[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<[number, StockToken]> = [];
  for (const t of list) {
    const s = t.s.toLowerCase();
    const n = t.n.toLowerCase();
    let score = -1;
    if (s === q) score = 0;
    else if (s.startsWith(q)) score = 1;
    else if (n.split(/[\s.,&()-]+/).some((w) => w.startsWith(q))) score = 2;
    // Mid-word matches only from 3 characters: "v" should not list every name containing a v.
    else if (q.length >= 3 && n.includes(q)) score = 3;
    if (score >= 0) scored.push([score, t]);
  }
  return scored.sort((x, y) => x[0] - y[0] || x[1].s.length - y[1].s.length || x[1].s.localeCompare(y[1].s)).slice(0, limit).map(([, t]) => t);
}

export function bySymbol(list: StockToken[], symbol: string): StockToken | undefined {
  const s = symbol.trim().toUpperCase();
  return list.find((t) => t.s === s);
}

export function byAddress(list: StockToken[], address: string): StockToken | undefined {
  const a = address.trim().toLowerCase();
  return list.find((t) => t.a.toLowerCase() === a);
}

/** A query parameter that names a stock by ticker. */
export const isTickerKey = (key: string) => /^(symbol|ticker|stock)$/i.test(key);
/** A query parameter that takes a token contract address (not a wallet). */
export const isTokenAddressKey = (key: string) => /^(token|asset|contract|ca|tokenaddress|token_address|mint)$/i.test(key);

/** "354.90" from bid 354.45 / ask 355.35; falls back to whichever side is set. */
export function midPrice(p: Pick<StockPrice, "bid" | "ask">): string | null {
  const b = Number(p.bid);
  const a = Number(p.ask);
  const v = b > 0 && a > 0 ? (b + a) / 2 : b > 0 ? b : a > 0 ? a : NaN;
  return Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 }) : null;
}
