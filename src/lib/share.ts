import { formatUsd } from "@/lib/x402/money";

/** Canonical site origin for share links and absolute OG URLs (never a preview host). */
export const SITE_URL = "https://x402fi.dev";

/** x402Fi's X handle, tagged in every share post. */
export const X_HANDLE = "x402fi_";

type Svc = { status: string; pricing: string; priceAtomic: string | null };

/**
 * The price a share card and post lead with. Fixed and native endpoints have a known
 * per-call price; quoted and contract ones are priced per request; free ones cost nothing.
 */
export function sharePrice(services: Svc[]): { price: string | null; note: string; kind: "paid" | "free" | "quoted" | "none" } {
  const live = services.filter((s) => s.status === "live");
  const known = live.filter((s) => (s.pricing === "fixed" || s.pricing === "native") && s.priceAtomic && BigInt(s.priceAtomic) > 0n).map((s) => BigInt(s.priceAtomic!));
  const quoted = live.some((s) => s.pricing === "quote" || s.pricing === "contract");
  const free = live.some((s) => s.pricing === "free");
  if (known.length) {
    const min = known.reduce((a, b) => (b < a ? b : a));
    const varies = quoted || known.some((k) => k !== min);
    return { price: formatUsd(min), note: varies ? "from, per call" : "per call", kind: "paid" };
  }
  if (free) return { price: "Free", note: quoted ? "lookups · paid calls quoted" : "no payment needed", kind: "free" };
  if (quoted) return { price: null, note: "priced per request", kind: "quoted" };
  return { price: null, note: "", kind: "none" };
}

/** The card's footer line: never "paid per call" next to a Free price. */
export function cardTagline(kind: ReturnType<typeof sharePrice>["kind"]): string {
  return kind === "paid" || kind === "quoted"
    ? "Paid per call by AI agents · USDG on Robinhood Chain"
    : "For AI agents · USDG on Robinhood Chain";
}

/** Bump when the card's design changes, so every cached card is fetched again. */
// 3: card logos fetched without WebP (2026-11-13), so cached cards with a missing logo refresh.
// 4: home polish (2026-11-14): dot grid, USDG token price, Robinhood Chain mark, Verified payee seal.
export const CARD_DESIGN = 4;

/**
 * A short version for a listing's card URL (?v=…): changes when anything the card draws
 * changes (name, summary, category, prices, payee name, seller logo URL, design). A logo
 * set on the payee name's ENS record is not included: that would need an ENS read per page.
 */
export function cardVersion(l: { name: string; summary: string; category: string; identityName: string | null; logoUrl: string | null; services: Svc[] }, payeeVerified = false): string {
  const p = sharePrice(l.services);
  // The Verified seal is part of the URL, so a card that loses (or gains) it is fetched again.
  const key = JSON.stringify([CARD_DESIGN, l.name, l.summary, l.category, l.identityName, l.logoUrl, p.price, p.note, payeeVerified]);
  let h = 0x811c9dc5; // FNV-1a, 32-bit: a cache key, not a security property
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** X counts every link as 23 characters, whatever its length. */
const X_LIMIT = 280;
const X_URL_LEN = 23;

/** Shortens at a word boundary (when one is near) and marks it with an ellipsis. */
const clip = (s: string, n: number): string => {
  if (n <= 1) return "";
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return (space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "") + "…";
};

/**
 * The post text for sharing a listing on X (the URL is passed separately to the intent,
 * which appends it). Fits 280 with the link: the summary is what gets shortened.
 */
export function shareText(l: { name: string; summary: string }, price: ReturnType<typeof sharePrice>, sellerX?: string | null): string {
  const by = sellerX ? ` by @${sellerX}` : "";
  const head = `${clip(l.name, 60)}${by} is live on @${X_HANDLE}`;
  const tail =
    price.kind === "paid"
      ? `AI agents pay ${price.note.startsWith("from") ? "from " : ""}${price.price} per call in USDG on Robinhood Chain. No account, no API key.`
      : price.kind === "free"
        ? price.note.startsWith("lookups")
          ? "Free for AI agents to call, with paid calls settled in USDG on Robinhood Chain."
          : "Free for AI agents to call."
        : "AI agents pay per request in USDG on Robinhood Chain. No account, no API key.";
  // head \n\n summary \n\n tail \n link
  const room = X_LIMIT - X_URL_LEN - 1 - head.length - tail.length - 4;
  const summary = clip(l.summary.trim(), room);
  return summary ? `${head}\n\n${summary}\n\n${tail}` : `${head}\n\n${tail}`;
}

export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url }).toString()}`;
}
