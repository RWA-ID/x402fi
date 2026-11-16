import { desc, inArray } from "drizzle-orm";
import { listings, reviews, services } from "@/db/schema";
import { envAsync, db } from "@/lib/server/env";
import { SITE_URL } from "@/lib/share";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * HEY Research Lab's feed of reviews in progress (requested, findings_sent, fixes_submitted).
 * Private: needs `authorization: Bearer <HEY_REVIEW_FEED_TOKEN>`. Carries the lister's repo,
 * commit, contact and API base URL, which they agreed to share when they asked for a review.
 */
export async function GET(req: Request) {
  const e = await envAsync();
  const token = e.HEY_REVIEW_FEED_TOKEN;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !got || !timingSafeEqual(got, token)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const d = db(e);
  const rows = await d.select().from(reviews).where(inArray(reviews.state, ["requested", "findings_sent", "fixes_submitted"])).orderBy(desc(reviews.updatedAt)).limit(200);
  if (!rows.length) return Response.json({ requests: [] });
  const svc = await d.select().from(services).where(inArray(services.id, rows.map((r) => r.serviceId)));
  const ls = await d.select({ id: listings.id, slug: listings.slug, name: listings.name, upstreamUrl: listings.upstreamUrl, status: listings.status }).from(listings).where(inArray(listings.id, [...new Set(rows.map((r) => r.listingId))]));
  const S = new Map(svc.map((s) => [s.id, s])), L = new Map(ls.map((l) => [l.id, l]));
  return Response.json({
    requests: rows.flatMap((r) => {
      const s = S.get(r.serviceId), l = L.get(r.listingId);
      if (!s || !l) return [];
      const path = s.path === "/" ? "" : s.path;
      return [{
        listing: l.slug,
        endpoint: s.id,
        state: r.state,
        listingName: l.name,
        listingUrl: `${SITE_URL}/market/${l.slug}`,
        listingStatus: l.status,
        method: s.method,
        path: s.path,
        pricing: s.pricing,
        endpointStatus: s.status,
        buyerUrl: s.pricing === "native" ? `${l.upstreamUrl.replace(/\/+$/, "")}${path}` : `${SITE_URL}/g/${l.slug}${path}`,
        upstreamUrl: `${l.upstreamUrl.replace(/\/+$/, "")}${path}`,
        repoUrl: r.repoUrl,
        commit: r.commit,
        contact: r.contact,
        note: r.note,
        requestedAt: r.requestedAt,
        updatedAt: r.updatedAt,
      }];
    }),
  });
}
