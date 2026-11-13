/**
 * Payee names offered in the listing wizard: HoodFi names (*.hoodfi.eth, Robinhood Chain,
 * paid in USDG over x402) and x402 Identity names (*.402api.eth etc., Ethereum, paid in ETH).
 * Pure: shared by the wizard (client) and /api/names (server).
 */
import { namehash, type Address, type Hex } from "viem";

/** x402 Identity Hub contracts on Ethereum mainnet (see RWA-ID/x402-Identity). */
export const X402ID_REGISTRAR = "0xeb9e9ea385fe28b51a3f9a7d93fb893e0a1f9633" as Address;
export const X402ID_FORWARDER = "0x05af104ce913e7ef39799bfada871817d3761778" as Address;
/** x402Fi charges no platform fee, so nothing is ever sent here. */
export const NO_FEE_TREASURY = "0x000000000000000000000000000000000000dEaD" as Address;

export const X402ID_PARENTS = [
  { label: "402api.eth", short: "API", description: "Services and APIs" },
  { label: "402bot.eth", short: "Agent", description: "AI agents" },
  { label: "402mcp.eth", short: "MCP", description: "MCP servers" },
].map((p) => ({ ...p, node: namehash(p.label) as Hex }));
export type X402Parent = (typeof X402ID_PARENTS)[number];

/**
 * HoodFi's L2Registry on Robinhood Chain: ERC-721 for *.hoodfi.eth and the resolver for
 * every HoodFi name (TextResolver, AddrResolver, Multicallable). Node = standard namehash.
 */
export const HOODFI_REGISTRY = "0xf2bABA012244bdD7445129597350054E1B3aEe5C" as Address;

/** HoodfiX402Registrar on Robinhood Chain: quote(label) → (price, status, available). */
export const HOODFI_X402_REGISTRAR = "0x64A6439a05aa4c91c3ACE97842a98148888A2534" as Address;

/** Same rule as the listing slug, so a service name and its suggested name line up. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "service";
}

/** A valid single DNS-style label: lowercase letters, digits, inner hyphens, 1-63 chars. */
export function isLabel(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s) && !s.includes("--");
}

/** "Acme Data", "acme-data.hoodfi.eth" or "  ACME  " → a label, or null. */
export function toLabel(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\.(hoodfi|402api|402bot|402mcp)\.eth$/, "");
  const l = s.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return l && isLabel(l) ? l : null;
}

const FILLER = new Set(["the", "a", "an", "and", "of", "for", "api", "apis", "service", "services", "data", "inc", "llc", "co", "trade", "io", "app"]);

/**
 * Up to `max` name labels derived from a service name, best first:
 * "StockFi Trade" → stockfi-trade, stockfi, stockfitrade, stockfi-api.
 * Only 4+ character labels: shorter HoodFi names are premium-priced and shorter
 * ones read as squatting bait in a suggestion list.
 */
export function suggestLabels(serviceName: string, max = 4): string[] {
  const words = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const core = words.filter((w) => !FILLER.has(w));
  const main = core[0] ?? words[0]!;
  const out: string[] = [];
  const add = (l: string | null) => {
    if (l && l.length >= 4 && isLabel(l) && !out.includes(l)) out.push(l);
  };
  const full = words.filter((w) => !["the", "a", "an"].includes(w));
  add((full.length ? full : words).join("-"));
  add(main);
  add(words.join(""));
  if (core.length > 1) add(core.slice(0, 2).join("-"));
  add(`${main}-api`);
  add(`${main}hq`);
  return out.slice(0, max);
}

export type HoodfiAvailability =
  | { available: true; priceAtomic: string }
  | { available: false; reason: string }
  | { available: null; reason: string }; // could not check

export type X402Availability =
  | { available: true; feeWei: string }
  | { available: false; reason: string }
  | { available: null; reason: string };

export interface NameSuggestion {
  label: string;
  hoodfi: HoodfiAvailability;
  x402: X402Availability & { parent: string };
}
