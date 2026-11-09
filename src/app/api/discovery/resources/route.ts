import { and, asc, eq, inArray } from "drizzle-orm";
import { getAddress } from "viem";
import { listings, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { buildRequirements } from "@/lib/x402/requirements";
import { parseContractConfig } from "@/lib/x402/contract";

/**
 * Bazaar-style discovery: one item per paid, live endpoint of every live listing.
 * A quoted endpoint is listed at its ceiling (the most one call can cost) and
 * marked pricing "quote"; its 402 names the exact price per request.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const d = db(await envAsync());
  const ls = await d.select().from(listings).where(eq(listings.status, "live"));
  const svc = ls.length
    ? await d.select().from(services).where(and(inArray(services.listingId, ls.map((l) => l.id)), eq(services.status, "live"))).orderBy(asc(services.sortOrder))
    : [];
  const byId = new Map(ls.map((l) => [l.id, l]));
  const items = svc
    .filter((s) => s.pricing !== "free")
    .flatMap((s) => {
      const l = byId.get(s.listingId)!;
      const amount = s.pricing === "fixed" ? s.priceAtomic : s.maxPriceAtomic;
      if (!amount) return [];
      // A contract endpoint is paid to its contract, not the listing's wallet.
      const cfg = s.pricing === "contract" ? parseContractConfig(s.contractConfig) : null;
      if (s.pricing === "contract" && !cfg) return [];
      const payTo = cfg ? cfg.address : getAddress(l.payTo);
      const resource = `${origin}/g/${l.slug}${s.path === "/" ? "" : s.path}`;
      return [{
        resource,
        type: "http",
        x402Version: 2,
        accepts: [buildRequirements({ url: resource, description: s.summary || l.summary, amountAtomic: BigInt(amount), payTo })],
        lastUpdated: new Date(Math.max(l.updatedAt, s.updatedAt) * 1000).toISOString(),
        metadata: {
          name: l.name === s.name ? l.name : `${l.name}: ${s.name}`,
          description: s.summary || l.description,
          category: l.category,
          method: s.method,
          pricing: s.pricing,
          ...(s.pricing === "quote" || s.pricing === "contract" ? { priceIsCeiling: true } : {}),
          ...(cfg ? { settlement: "contract", contract: cfg.address, pathTemplate: `${resource}/{name}` } : {}),
          payeeName: l.identityName,
          listing: `${origin}/market/${l.slug}`,
        },
      }];
    });
  return Response.json({ x402Version: 2, items, pagination: { limit: items.length, offset: 0, total: items.length } });
}
