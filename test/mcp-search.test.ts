import { describe, it, expect } from "vitest";
import { searchItems, type SearchableItem } from "@/lib/mcp/search";

const item = (name: string, category: string, amount: string, description = "", payeeName: string | null = null): SearchableItem => ({
  resource: `https://x402fi.dev/g/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  description,
  serviceName: name,
  tags: [category],
  accepts: [{ amount }],
  metadata: { name, category, payeeName },
});

const items = [
  item("StockFi Trade: Preflight", "AI & agents", "20000", "GO/CAUTION/STOP data checks for a Robinhood Chain Stock Token.", "stockfi.hoodfi.eth"),
  item("AgentFuel Rug-Check", "AI & agents", "10000", "Checks a token for rug risks."),
  item("x402Fi demo: paid hello", "Developer tools", "10000", "A cent buys a signed hello."),
  item("Reopen Risk weekend report", "Finance", "50000", "Weekend stock exposure for a wallet."),
];

const names = (r: SearchableItem[]) => r.map((i) => i.metadata.name);

describe("searchItems", () => {
  it("needs every word to match somewhere", () => {
    expect(names(searchItems(items, { query: "rug check", limit: 10 }))).toEqual(["AgentFuel Rug-Check"]);
    expect(searchItems(items, { query: "rug weather", limit: 10 })).toEqual([]);
  });

  it("ranks a name hit above a description hit, then cheapest first", () => {
    // "stock": in the Preflight name (3) vs only in the Reopen Risk description (1).
    expect(names(searchItems(items, { query: "stock", limit: 10 }))).toEqual(["StockFi Trade: Preflight", "Reopen Risk weekend report"]);
  });

  it("matches the payee name", () => {
    expect(names(searchItems(items, { query: "stockfi.hoodfi.eth", limit: 10 }))).toEqual(["StockFi Trade: Preflight"]);
  });

  it("filters by exact category (case-insensitive) and by price ceiling", () => {
    expect(names(searchItems(items, { category: "developer TOOLS", limit: 10 }))).toEqual(["x402Fi demo: paid hello"]);
    expect(names(searchItems(items, { maxPriceAtomic: 10000n, limit: 10 }))).toEqual(["AgentFuel Rug-Check", "x402Fi demo: paid hello"]);
  });

  it("lists everything cheapest first with no query, and respects the limit", () => {
    const all = searchItems(items, { limit: 10 });
    expect(all).toHaveLength(4);
    expect(BigInt(all[0].accepts[0].amount)).toBe(10000n);
    expect(all.at(-1)!.metadata.name).toBe("Reopen Risk weekend report");
    expect(searchItems(items, { limit: 2 })).toHaveLength(2);
  });

  it("ignores punctuation and single letters in the query", () => {
    expect(names(searchItems(items, { query: "  Rug-Check! a ", limit: 10 }))).toEqual(["AgentFuel Rug-Check"]);
  });
});
