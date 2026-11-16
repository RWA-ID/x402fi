import { eq, sql } from "drizzle-orm";
import { isHex } from "viem";
import { listings, reviewEvents, reviews, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { toRow } from "@/lib/server/reviews";
import { applySignedReview, parseReviewMessage, parseSigners, reviewTarget, REVIEW_DOMAIN, REVIEW_TYPES } from "@/lib/reviews";

/**
 * HEY Research Lab posts a signed review state here: { message, signature }.
 * message = { listing, endpoint, commit, reportUrl, state, issuedAt }, EIP-712 domain
 * "HEY Security Review" v1 (no chainId), type Review. Verified against HEY_REVIEW_SIGNERS,
 * the addresses HEY publishes on heyresearch.xyz. GET describes the format.
 */
export async function GET() {
  const e = await envAsync();
  return Response.json({
    post: { message: "Review", signature: "0x… (65-byte EIP-712 signature)" },
    domain: REVIEW_DOMAIN,
    types: REVIEW_TYPES,
    primaryType: "Review",
    states: ["findings_sent", "reviewed", "withdrawn"],
    notes: [
      "listing = the listing slug; endpoint = the x402Fi endpoint id from GET /api/reviews/requests.",
      "issuedAt (unix seconds) must increase per endpoint and be on or after the lister's latest request.",
      "reviewed needs commit (7-64 lowercase hex) and an https:// reportUrl. Other states may leave them empty.",
    ],
    signers: parseSigners(e.HEY_REVIEW_SIGNERS),
  });
}

export async function POST(req: Request) {
  const e = await envAsync();
  const body = (await req.json().catch(() => null)) as { message?: unknown; signature?: unknown } | null;
  const message = parseReviewMessage(body?.message);
  if (!message) return Response.json({ error: "message must be { listing, endpoint, commit, reportUrl, state, issuedAt }." }, { status: 400 });
  if (typeof body?.signature !== "string" || !isHex(body.signature)) return Response.json({ error: "signature must be 0x-hex." }, { status: 400 });

  const d = db(e);
  const svc = await d.query.services.findFirst({ where: eq(services.id, message.endpoint) });
  if (!svc) return Response.json({ error: "Unknown endpoint." }, { status: 404 });
  const listing = await d.query.listings.findFirst({ where: eq(listings.id, svc.listingId), columns: { slug: true, upstreamUrl: true } });
  if (!listing) return Response.json({ error: "Unknown endpoint." }, { status: 404 });
  const row = await d.query.reviews.findFirst({ where: eq(reviews.serviceId, svc.id) });
  const [logged] = await d.select({ m: sql<number | null>`max(cast(json_extract(${reviewEvents.message}, '$.issuedAt') as integer))` }).from(reviewEvents).where(eq(reviewEvents.serviceId, svc.id));

  const r = await applySignedReview({
    message,
    signature: body.signature,
    signers: parseSigners(e.HEY_REVIEW_SIGNERS),
    current: row ? toRow(row) : null,
    requestedAt: row?.requestedAt ?? null,
    latestLoggedIssuedAt: logged?.m ?? null,
    listingSlug: listing.slug,
    target: reviewTarget(svc.method, svc.path, listing.upstreamUrl),
    now: Math.floor(Date.now() / 1000),
  });
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });

  const n = r.next;
  await d.batch([
    d.update(reviews).set({
      state: n.state, lastIssuedAt: n.lastIssuedAt, reviewedCommit: n.reviewedCommit, reportUrl: n.reportUrl,
      reviewedAt: n.reviewedAt, reviewedTarget: n.reviewedTarget, signer: n.signer, updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(reviews.serviceId, svc.id)),
    d.insert(reviewEvents).values({ id: crypto.randomUUID(), serviceId: svc.id, state: message.state, message: JSON.stringify(message), signature: body.signature, signer: r.signer }),
  ]);
  return Response.json({ ok: true, endpoint: svc.id, state: n.state });
}
