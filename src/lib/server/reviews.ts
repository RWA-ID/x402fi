import "server-only";
import { inArray } from "drizzle-orm";
import { listings, reviews, type Review, type Service } from "@/db/schema";
import { publicReview, reviewTarget, type PublicReview, type ReviewRow } from "@/lib/reviews";
import { db, envAsync } from "./env";

export function toRow(r: Review): ReviewRow {
  return {
    state: r.state, lastIssuedAt: r.lastIssuedAt, reviewedCommit: r.reviewedCommit, reportUrl: r.reportUrl,
    reviewedAt: r.reviewedAt, reviewedTarget: r.reviewedTarget, signer: r.signer,
  };
}

/**
 * The public review of each given endpoint (only endpoints with a review appear).
 * Reads the listings' upstream URLs server-side to tell "reviewed" from "out of date";
 * the URLs themselves never leave this function.
 */
export async function publicReviews(svc: Pick<Service, "id" | "listingId" | "method" | "path">[]): Promise<Map<string, PublicReview>> {
  const out = new Map<string, PublicReview>();
  if (!svc.length) return out;
  const d = db(await envAsync());
  const rows = await d.select().from(reviews).where(inArray(reviews.serviceId, svc.map((s) => s.id)));
  if (!rows.length) return out;
  const ups = await d.select({ id: listings.id, u: listings.upstreamUrl }).from(listings).where(inArray(listings.id, [...new Set(rows.map((r) => r.listingId))]));
  const upstream = new Map(ups.map((u) => [u.id, u.u]));
  for (const r of rows) {
    const s = svc.find((x) => x.id === r.serviceId);
    const u = upstream.get(r.listingId);
    const p = publicReview(toRow(r), s && u ? reviewTarget(s.method, s.path, u) : null);
    if (p) out.set(r.serviceId, p);
  }
  return out;
}
