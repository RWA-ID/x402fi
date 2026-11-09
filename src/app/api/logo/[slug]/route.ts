import { eq } from "drizzle-orm";
import { listings } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { fetchListingLogo } from "@/lib/server/logo";

const none = () => new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300" } });

/**
 * A listing's logo, fetched server-side so viewers' browsers never contact the
 * seller's host (no tracking pixels) and only raster images are ever served.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = await db(await envAsync()).query.listings.findFirst({ where: eq(listings.slug, slug) });
  if (!l || l.status === "draft") return none();
  const logo = await fetchListingLogo(l);
  if (!logo) return none();
  return new Response(logo.bytes, {
    headers: {
      "content-type": logo.type,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
