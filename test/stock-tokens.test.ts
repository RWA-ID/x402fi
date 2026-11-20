import { describe, expect, it } from "vitest";
import { byAddress, bySymbol, isTickerKey, isTokenAddressKey, logoUrl, midPrice, searchTokens, slimAssets, slimPrice, type StockToken } from "@/lib/stock-tokens";

const asset = (sym: string, name: string, addr: string, extra: Record<string, unknown> = {}) => ({
  tokenSymbol: sym, tokenName: `${name} • Robinhood Token`, status: "ASSET_STATUS_ACTIVE",
  deployments: [{ contractAddress: addr, chainId: 4663 }], ...extra,
});
const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

describe("slimAssets", () => {
  it("keeps active Robinhood Chain tokens, strips the name suffix, sorts by ticker", () => {
    const list = slimAssets({ assets: [
      asset("TSLA", "Tesla", A(2)),
      asset("AAPL", "Apple", A(1)),
      asset("OLD", "Gone", A(3), { status: "ASSET_STATUS_INACTIVE" }),
      asset("ETH1", "Elsewhere", A(4), { deployments: [{ contractAddress: A(4), chainId: 1 }] }),
      asset("BAD", "Bad address", "0x123"),
    ] });
    expect(list).toEqual([{ s: "AAPL", n: "Apple", a: A(1) }, { s: "TSLA", n: "Tesla", a: A(2) }]);
  });

  it("keeps a well-formed ISIN for the logo and drops a malformed one", () => {
    const list = slimAssets({ assets: [
      asset("ANT", "Anthropic, PBC Class A Common Stock", A(1), { isin: "US03703U1079" }),
      asset("BAD", "Bad ISIN", A(2), { isin: "12345" }),
    ] });
    expect(list).toEqual([
      { s: "ANT", n: "Anthropic, PBC Class A Common Stock", a: A(1), i: "US03703U1079" },
      { s: "BAD", n: "Bad ISIN", a: A(2) },
    ]);
  });

  it("throws on an unexpected shape, so the route serves its cached copy", () => {
    expect(() => slimAssets({})).toThrow(/no assets array/);
  });
});

describe("slimPrice and midPrice", () => {
  it("reads Robinhood's quote", () => {
    const p = slimPrice({ quotes: [{ tokenSymbol: "AAPL", bid: "354.45", ask: "355.35", isTradingHalt: false, generatedAt: "2026-11-15T23:36:47Z" }] });
    expect(p).toEqual({ symbol: "AAPL", bid: "354.45", ask: "355.35", halted: false, at: "2026-11-15T23:36:47Z" });
    expect(midPrice(p!)).toBe("354.90");
    expect(slimPrice({ quotes: [] })).toBeNull();
  });

  it("falls back to one side, and gives null with no price", () => {
    expect(midPrice({ bid: "0", ask: "12.5" })).toBe("12.50");
    expect(midPrice({ bid: "", ask: "" })).toBeNull();
    expect(midPrice({ bid: "1234.5", ask: "1235.5" })).toBe("1,235.00");
  });
});

describe("searchTokens", () => {
  const list: StockToken[] = [
    { s: "NVDA", n: "NVIDIA", a: A(1) },
    { s: "NVTS", n: "Navitas Semiconductor", a: A(2) },
    { s: "TSM", n: "Taiwan Semiconductor Manufacturing", a: A(3) },
    { s: "SMH", n: "VanEck Semiconductor ETF", a: A(4) },
    { s: "V", n: "Visa", a: A(5) },
    { s: "VTI", n: "Vanguard Morningstar Total Stock Market ETF", a: A(6) },
  ];

  it("ranks exact ticker, then ticker prefix, then a name word, then anywhere in the name", () => {
    expect(searchTokens(list, "v").map((t) => t.s)).toEqual(["V", "VTI", "SMH"]);
    expect(searchTokens(list, "nv").map((t) => t.s)).toEqual(["NVDA", "NVTS"]);
    expect(searchTokens(list, "semi").map((t) => t.s)).toEqual(["SMH", "TSM", "NVTS"]);
    expect(searchTokens(list, "nvid").map((t) => t.s)).toEqual(["NVDA"]);
    expect(searchTokens(list, "  ")).toEqual([]);
  });

  it("finds by ticker (any case) and by address (any case)", () => {
    expect(bySymbol(list, " nvda ")?.n).toBe("NVIDIA");
    expect(byAddress(list, A(3).toUpperCase().replace("0X", "0x"))?.s).toBe("TSM");
    expect(bySymbol(list, "EURUSD")).toBeUndefined();
  });
});

describe("field matching and logos", () => {
  it("knows ticker and token-address parameter names, not wallets", () => {
    expect(isTickerKey("symbol")).toBe(true);
    expect(isTickerKey("pair")).toBe(false);
    expect(isTokenAddressKey("token")).toBe(true);
    expect(isTokenAddressKey("wallet")).toBe(false);
  });

  it("builds a Brandfetch ticker URL when there is no ISIN", () => {
    expect(logoUrl({ s: "BRK.B" })).toMatch(/^https:\/\/cdn\.brandfetch\.io\/ticker\/BRK\.B\/w\/64\/h\/64\?c=/);
    expect(logoUrl({ s: "X", i: "not-an-isin" })).toMatch(/\/ticker\/X\//);
  });

  it("prefers the ISIN (a new IPO's ticker comes back blank)", () => {
    expect(logoUrl({ s: "ANT", i: "US03703U1079" })).toMatch(/^https:\/\/cdn\.brandfetch\.io\/isin\/US03703U1079\/w\/64\/h\/64\?c=/);
  });
});
