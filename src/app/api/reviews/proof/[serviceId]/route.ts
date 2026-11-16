import { and, desc, eq } from "drizzle-orm";
import { reviewEvents, reviews } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { REVIEW_DOMAIN, REVIEW_TYPES } from "@/lib/reviews";

type Ctx = { params: Promise<{ serviceId: string }> };

/**
 * The signed message behind a "reviewed" endpoint, so anyone can recover the signer and
 * compare it with the address HEY publishes on heyresearch.xyz. Only for reviewed endpoints:
 * findings_sent messages stay private until fixed.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const id = (await params).serviceId;
  const d = db(await envAsync());
  const row = await d.query.reviews.findFirst({ where: eq(reviews.serviceId, id), columns: { state: true } });
  if (row?.state !== "reviewed") return Response.json({ error: "This endpoint has no current review." }, { status: 404 });
  const [ev] = await d.select().from(reviewEvents).where(and(eq(reviewEvents.serviceId, id), eq(reviewEvents.state, "reviewed"))).orderBy(desc(reviewEvents.createdAt)).limit(1);
  if (!ev) return Response.json({ error: "This endpoint has no current review." }, { status: 404 });
  return Response.json(
    { domain: REVIEW_DOMAIN, types: REVIEW_TYPES, primaryType: "Review", message: JSON.parse(ev.message), signature: ev.signature, signer: ev.signer, checkSignerAt: "https://heyresearch.xyz" },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" } },
  );
}
