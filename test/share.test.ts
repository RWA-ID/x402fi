import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cardTagline, sharePrice, shareText, xIntentUrl, X_HANDLE } from "@/lib/share";
import { BRAND_FILES, OG_FONTS, OG_SIZE, renderListingCard, renderSiteCard, type CardBrand, type CardFont } from "@/lib/ogcard";

const svc = (pricing: string, priceAtomic: string | null = null, status = "live") => ({ pricing, priceAtomic, status });
/** X's count: every URL is 23 chars, plus the newline the intent puts before it. */
const xLength = (text: string) => [...text].length + 1 + 23;

describe("share price", () => {
  it("leads with the cheapest known per-call price", () => {
    expect(sharePrice([svc("fixed", "10000")])).toEqual({ price: "$0.01", note: "per call", kind: "paid" });
    expect(sharePrice([svc("fixed", "50000"), svc("native", "1000")]).price).toBe("$0.001");
    expect(sharePrice([svc("fixed", "50000"), svc("native", "1000")]).note).toBe("from, per call");
  });
  it("ignores paused endpoints", () => {
    expect(sharePrice([svc("fixed", "1000", "paused"), svc("fixed", "20000")]).price).toBe("$0.02");
  });
  it("free lookups + priced registrations (the HoodFi shape)", () => {
    expect(sharePrice([svc("free"), svc("contract")])).toMatchObject({ price: "Free", kind: "free" });
  });
  it("quote-only and empty listings show no price", () => {
    expect(sharePrice([svc("quote")])).toMatchObject({ price: null, kind: "quoted" });
    expect(sharePrice([])).toMatchObject({ price: null, kind: "none" });
  });
});

describe("share text", () => {
  const l = { name: "HoodFi Names", summary: "Look up and register hoodfi.eth names on Robinhood Chain." };
  it("tags x402Fi and the seller, and states the price", () => {
    const t = shareText(l, sharePrice([svc("fixed", "10000")]), "hoodfi");
    expect(t.startsWith(`HoodFi Names by @hoodfi is live on @${X_HANDLE}`)).toBe(true);
    expect(t).toContain(l.summary);
    expect(t).toContain("pay $0.01 per call in USDG on Robinhood Chain");
    expect(t).not.toMatch(/\bfrom \$0\.01/);
  });
  it("says 'from' when prices vary", () => {
    expect(shareText(l, sharePrice([svc("fixed", "10000"), svc("quote")]))).toContain("pay from $0.01 per call");
  });
  it("always fits X's 280 limit with the link, shortening the summary", () => {
    const long = { name: "N".repeat(60), summary: "S".repeat(140) };
    const t = shareText(long, sharePrice([svc("fixed", "10000")]), "a_very_long_handle1");
    expect(xLength(t)).toBeLessThanOrEqual(280);
    expect(t).toContain("…");
    expect(xLength(shareText(l, sharePrice([svc("free"), svc("contract")])))).toBeLessThanOrEqual(280);
  });
  it("builds an X intent with the text and link encoded", () => {
    const u = new URL(xIntentUrl("a & b\nc", "https://x402fi.dev/market/x"));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe("a & b\nc");
    expect(u.searchParams.get("url")).toBe("https://x402fi.dev/market/x");
  });
});

describe("OG card", () => {
  const fonts: CardFont[] = OG_FONTS.map((f) => {
    const b = readFileSync(`public/fonts/${f.file}`);
    return { name: f.name, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight: f.weight, style: f.style };
  });
  const brand = Object.fromEntries(Object.entries(BRAND_FILES).map(([k, f]) => [k, `data:image/png;base64,${readFileSync(`public/${f}`).toString("base64")}`])) as unknown as CardBrand;
  const jpg = `data:image/jpeg;base64,${readFileSync("test/fixtures/logo.jpg").toString("base64")}`;
  const cards = {
    hoodfi: { name: "HoodFi Names", summary: "Look up and register hoodfi.eth names on Robinhood Chain.", category: "Developer tools", price: "Free", priceNote: "lookups · paid calls priced per request", payeeName: "hoodfi.402api.eth", tagline: cardTagline("free"), logo: jpg },
    verified: { name: "StockFi Trade", summary: "Stock Token GO/CAUTION/STOP checks and Monday-gap loan stress. Data only.", category: "AI & agents", price: "$0.02", priceNote: "from, per call", payeeName: "stockfi.hoodfi.eth", payeeVerified: true, tagline: cardTagline("paid"), logo: null },
    long: { name: "AgentFuel Rug Check for Robinhood Chain Tokens and Pools", summary: "S".repeat(10) + " checks every new token for honeypots, mint authority, LP locks and owner privileges before your agent buys it, in one call.", category: "AI & agents", price: "$0.01", priceNote: "per call", payeeName: null, tagline: cardTagline("paid"), logo: jpg },
  };
  const renders: Record<string, () => Response> = {
    ...Object.fromEntries(Object.entries(cards).map(([k, card]) => [k, () => renderListingCard(card, fonts, brand)])),
    site: () => renderSiteCard(fonts, brand),
  };
  for (const [k, render] of Object.entries(renders)) {
    it(`renders a ${OG_SIZE.width}x${OG_SIZE.height} PNG (${k})`, async () => {
      const png = new Uint8Array(await render().arrayBuffer());
      expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
      const view = new DataView(png.buffer);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([OG_SIZE.width, OG_SIZE.height]);
      if (process.env.OG_OUT) {
        mkdirSync(process.env.OG_OUT, { recursive: true });
        writeFileSync(`${process.env.OG_OUT}/${k}.png`, png);
      }
    }, 30_000);
  }
});
