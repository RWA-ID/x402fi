import { listingBySlug } from "@/lib/server/queries";
import { listingCardImage } from "@/lib/server/og";
import { cardTagline, sharePrice } from "@/lib/share";

type Ctx = { params: Promise<{ slug: string }> };

/** 1200x630 share card for a listing: /og/listing/<slug>. Referenced by the page's og:image. */
export async function GET(req: Request, { params }: Ctx) {
  const l = await listingBySlug((await params).slug).catch(() => null);
  if (!l || l.status === "draft") return new Response("Not found", { status: 404 });
  const p = sharePrice(l.services);
  return listingCardImage(
    {
      name: l.name,
      summary: l.summary,
      category: l.category,
      price: p.price,
      priceNote: p.kind === "quoted" ? "" : p.note,
      payeeName: l.identityName,
      tagline: cardTagline(p.kind),
    },
    new URL(req.url).origin,
  );
}
