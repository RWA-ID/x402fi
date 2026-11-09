import { usdToAtomic, MIN_PRICE_ATOMIC } from "@/lib/x402/money";

export type Pricing = "free" | "fixed" | "quote" | "contract";

export interface ServiceLike {
  id: string;
  method: string;
  path: string;
  pricing: Pricing;
  priceAtomic: string | null;
  quotePath: string | null;
  maxPriceAtomic: string | null;
  status: "live" | "paused";
  sortOrder: number;
}

/** "/register/" → "/register"; "" → "/". */
export function normalizePath(p: string): string {
  const s = ("/" + p.trim()).replace(/\/+/g, "/").replace(/\/$/, "");
  return s || "/";
}

/** True when `requestPath` is `prefix` or lies under it. */
export function pathMatches(prefix: string, requestPath: string): boolean {
  const pre = normalizePath(prefix);
  const req = normalizePath(requestPath);
  if (pre === "/") return true;
  return req === pre || req.startsWith(pre + "/");
}

/**
 * The service for a request: same method (HEAD counts as GET), longest matching
 * path prefix. Paused services never match.
 */
export function matchService<T extends ServiceLike>(services: T[], method: string, requestPath: string): T | null {
  const m = method === "HEAD" ? "GET" : method;
  let best: T | null = null;
  for (const s of services) {
    if (s.status !== "live" || s.method !== m || !pathMatches(s.path, requestPath)) continue;
    if (!best || normalizePath(s.path).length > normalizePath(best.path).length) best = s;
  }
  return best;
}

/** Methods offered at a path, for a 405 "Allow" header. */
export function allowedMethods(services: ServiceLike[], requestPath: string): string[] {
  return [...new Set(services.filter((s) => s.status === "live" && pathMatches(s.path, requestPath)).map((s) => s.method))];
}

/**
 * The upstream path for the seller's quote: the service prefix is swapped for
 * quotePath. With path "/register" and quotePath "/quote/register", a request for
 * "/register/alice" is quoted at "/quote/register/alice".
 */
export function quoteRequestPath(service: Pick<ServiceLike, "path" | "quotePath">, requestPath: string): string {
  const pre = normalizePath(service.path);
  const req = normalizePath(requestPath);
  const rest = pre === "/" ? req : req.slice(pre.length);
  return normalizePath(normalizePath(service.quotePath ?? "/") + rest);
}

export type QuoteResult = { ok: true; amountAtomic: bigint } | { ok: false; reason: string };

/**
 * Parses a seller's quote. Accepted bodies: {"amount":"5000000"} (USDG atomic,
 * 6 decimals) or {"price":"5.00"} (dollars). Anything else, a non-positive price
 * or one above the service's ceiling is refused: buyers are never quoted more
 * than the ceiling the listing shows.
 */
export function parseQuote(body: unknown, maxPriceAtomic: string | null): QuoteResult {
  if (!body || typeof body !== "object") return { ok: false, reason: "quote_not_json" };
  const b = body as { amount?: unknown; price?: unknown; available?: unknown; error?: unknown };
  if (b.available === false) return { ok: false, reason: typeof b.error === "string" ? b.error.slice(0, 200) : "not_available" };
  let amount: bigint;
  try {
    if (typeof b.amount === "string" && /^\d+$/.test(b.amount)) amount = BigInt(b.amount);
    else if (typeof b.price === "string" || typeof b.price === "number") amount = usdToAtomic(String(b.price));
    else return { ok: false, reason: "quote_missing_amount" };
  } catch {
    return { ok: false, reason: "quote_invalid_amount" };
  }
  if (amount < MIN_PRICE_ATOMIC) return { ok: false, reason: "quote_below_minimum" };
  if (!maxPriceAtomic) return { ok: false, reason: "quote_without_ceiling" };
  if (amount > BigInt(maxPriceAtomic)) return { ok: false, reason: "quote_above_ceiling" };
  return { ok: true, amountAtomic: amount };
}

/**
 * The single path segment after a contract service's prefix: "/register/alice" under
 * "/register" → "alice". Null when there is none or more than one, so the label sent
 * on-chain is exactly what the buyer typed (the contract validates it).
 */
export function labelFromPath(prefix: string, requestPath: string): string | null {
  const pre = normalizePath(prefix);
  const req = normalizePath(requestPath);
  if (!pathMatches(pre, req)) return null;
  const rest = (pre === "/" ? req : req.slice(pre.length)).replace(/^\//, "");
  if (!rest || rest.includes("/")) return null;
  try {
    const label = decodeURIComponent(rest);
    return label.length > 0 && label.length <= 64 ? label : null;
  } catch {
    return null;
  }
}

/** Price label for people: "Free", "$0.01", "Up to $15.00". */
export function priceLabel(s: Pick<ServiceLike, "pricing" | "priceAtomic" | "maxPriceAtomic">, format: (a: string) => string): string {
  if (s.pricing === "free") return "Free";
  if (s.pricing === "quote" || s.pricing === "contract") return s.maxPriceAtomic ? `Up to ${format(s.maxPriceAtomic)}` : "Priced per request";
  return s.priceAtomic ? format(s.priceAtomic) : "—";
}
