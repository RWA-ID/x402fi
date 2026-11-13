import { discoveryFeed, parseDiscoveryQuery } from "@/lib/server/discovery";

export const dynamic = "force-dynamic";

/**
 * Bazaar discovery feed (JSON). Human-readable view: /discovery
 * Filters: type, payTo, scheme, network, extensions; pagination: limit, offset.
 * Public data, so any origin may read it (browser-based agents included).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const feed = await discoveryFeed(url.origin, parseDiscoveryQuery(url.searchParams));
  return Response.json(feed, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" } });
}
