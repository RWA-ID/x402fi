import { listingBySlug } from "@/lib/server/queries";
import { listingCardImage } from "@/lib/server/og";
import { cardTagline, sharePrice } from "@/lib/share";
import { fetchListingLogo } from "@/lib/server/logo";

type Ctx = { params: Promise<{ slug: string }> };

/** 1200x630 share card for a listing: /og/listing/<slug>. Referenced by the page's og:image. */
export async function GET(req: Request, { params }: Ctx) {
  const l = await listingBySlug((await params).slug).catch(() => null);
  if (!l || l.status === "draft") return new Response("Not found", { status: 404 });
  const p = sharePrice(l.services);
  // The card renderer draws PNG, JPEG and GIF; a WebP logo is left out rather than breaking the card.
  const logo = await fetchListingLogo(l);
  const logoUrl = logo && logo.type !== "image/webp" ? `data:${logo.type};base64,${Buffer.from(logo.bytes).toString("base64")}` : null;
  return listingCardImage(
    {
      name: l.name,
      summary: l.summary,
      category: l.category,
      price: p.price,
      priceNote: p.kind === "quoted" ? "" : p.note,
      payeeName: l.identityName,
      tagline: cardTagline(p.kind),
      logo: logoUrl,
    },
    new URL(req.url).origin,
  );
}
