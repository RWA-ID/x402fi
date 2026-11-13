import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getAddress, isAddress, isAddressEqual } from "viem";
import { listings, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { buildRequirements } from "@/lib/x402/requirements";
import { parseContractConfig } from "@/lib/x402/contract";
import { bazaarExtension } from "@/lib/x402/bazaar";
import { nativeUrl, probeNative } from "./native";

/** Bazaar list filters (same names as the official SDK's ListDiscoveryResourcesParams). */
export interface DiscoveryQuery {
  type?: string;
  payTo?: string;
  scheme?: string;
  network?: string;
  /** Only items carrying this extension key, e.g. "bazaar" or "payee-name". */
  extensions?: string;
  limit?: number;
  offset?: number;
}

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/** Reads the Bazaar list query string. Bad numbers fall back to the defaults instead of failing. */
export function parseDiscoveryQuery(sp: URLSearchParams): DiscoveryQuery {
  const num = (k: string) => {
    const v = sp.get(k);
    return v !== null && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  const str = (k: string) => sp.get(k)?.trim() || undefined;
  return { type: str("type"), payTo: str("payTo"), scheme: str("scheme"), network: str("network"), extensions: str("extensions"), limit: num("limit"), offset: num("offset") };
}

const absoluteHttps = (u: string | null) => {
  try { return u && new URL(u).protocol === "https:" ? u : null; } catch { return null; }
};

/**
 * Bazaar-style discovery: one item per paid, live endpoint of every live listing.
 * A quoted endpoint is listed at its ceiling (the most one call can cost) and
 * marked pricing "quote"; its 402 names the exact price per request.
 *
 * Each item carries `extensions.bazaar` (how to call it: method, query/path params,
 * body, example output) and the same top-level fields the official SDK reads
 * (description, mimeType, serviceName, tags, iconUrl). `metadata` is x402Fi's own.
 */
export async function discoveryFeed(origin: string, q: DiscoveryQuery = {}) {
  const d = db(await envAsync());
  const ls = await d.select().from(listings).where(eq(listings.status, "live"));
  const svc = ls.length
    ? await d.select().from(services).where(and(inArray(services.listingId, ls.map((l) => l.id)), eq(services.status, "live"))).orderBy(asc(services.sortOrder))
    : [];
  const byId = new Map(ls.map((l) => [l.id, l]));
  const nested = await Promise.all(svc
    .filter((s) => s.pricing !== "free")
    .map(async (s) => {
      const l = byId.get(s.listingId)!;
      const name = l.name === s.name ? l.name : `${l.name}: ${s.name}`;
      const common = {
        type: "http" as const,
        x402Version: 2 as const,
        lastUpdated: new Date(Math.max(l.updatedAt, s.updatedAt) * 1000).toISOString(),
        mimeType: "application/json",
        serviceName: l.name,
        tags: [l.category],
        ...(absoluteHttps(l.logoUrl) ? { iconUrl: `${origin}/api/logo/${l.slug}` } : {}),
      };
      // Native: the seller's own URL, price and payTo read from its live 402 (cached).
      if (s.pricing === "native") {
        const url = nativeUrl(l.upstreamUrl, s.path, null);
        const p = await probeNative(nativeUrl(l.upstreamUrl, s.path, s.exampleRequest), s.method, s.exampleBody);
        if (!p.ok) return [];
        const payeeName = p.quote.payeeName ?? l.identityName;
        const description = s.summary || p.quote.description || l.description;
        return [{
          resource: url,
          ...common,
          description,
          accepts: [buildRequirements({ url, description: s.summary || l.summary, amountAtomic: BigInt(p.quote.amount), payTo: p.quote.payTo })],
          extensions: {
            // The seller's own declaration wins: it knows its API better than x402Fi does.
            bazaar: p.quote.bazaar ?? bazaarExtension(s, new URL(url).pathname),
            ...(payeeName ? { "payee-name": { info: { name: payeeName } } } : {}),
          },
          metadata: {
            name,
            description,
            category: l.category,
            method: s.method,
            pricing: "native",
            settlement: "direct",
            payeeName,
            listing: `${origin}/market/${l.slug}`,
          },
        }];
      }
      const amount = s.pricing === "fixed" ? s.priceAtomic : s.maxPriceAtomic;
      if (!amount) return [];
      // A contract endpoint is paid to its contract, not the listing's wallet.
      const cfg = s.pricing === "contract" ? parseContractConfig(s.contractConfig) : null;
      if (s.pricing === "contract" && !cfg) return [];
      const payTo = cfg ? cfg.address : getAddress(l.payTo);
      const resourcePath = `/g/${l.slug}${s.path === "/" ? "" : s.path}`;
      const resource = `${origin}${resourcePath}`;
      const description = s.summary || l.description;
      return [{
        resource,
        ...common,
        description,
        accepts: [buildRequirements({ url: resource, description: s.summary || l.summary, amountAtomic: BigInt(amount), payTo })],
        extensions: {
          bazaar: bazaarExtension(s, resourcePath),
          ...(l.identityName ? { "payee-name": { info: { name: l.identityName } } } : {}),
        },
        metadata: {
          name,
          description,
          category: l.category,
          method: s.method,
          pricing: s.pricing,
          ...(s.pricing === "quote" || s.pricing === "contract" ? { priceIsCeiling: true } : {}),
          ...(cfg ? { settlement: "contract", contract: cfg.address, pathTemplate: `${resource}/{name}` } : {}),
          payeeName: l.identityName,
          listing: `${origin}/market/${l.slug}`,
        },
      }];
    }));

  const all = nested.flat().filter((i) => {
    const a = i.accepts[0];
    if (q.type && i.type !== q.type) return false;
    if (q.scheme && a.scheme !== q.scheme) return false;
    if (q.network && a.network !== q.network) return false;
    if (q.payTo && !(isAddress(q.payTo) && isAddressEqual(q.payTo, a.payTo))) return false;
    if (q.extensions && !(q.extensions in i.extensions)) return false;
    return true;
  });
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = q.offset ?? 0;
  const items = all.slice(offset, offset + limit);
  return { x402Version: 2 as const, items, pagination: { limit, offset, total: all.length } };
}
