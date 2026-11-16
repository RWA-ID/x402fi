import { and, eq, inArray } from "drizzle-orm";
import { reviews, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { ownedListing } from "@/lib/server/services";
import { listerCan, validateRequest } from "@/lib/reviews";

/**
 * The lister asks HEY Research Lab to review endpoints of their listing.
 * Body: { listingId, serviceIds?: string[] | endpointKeys?: string[] ("GET /v1/rates"; default: every live endpoint),
 *         repoUrl?, commit?, contact, note? }.
 * Endpoints already requested or in review are left as they are.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { listingId?: string; serviceIds?: unknown; endpointKeys?: unknown; repoUrl?: unknown; commit?: unknown; contact?: unknown; note?: unknown };
  if (typeof body.listingId !== "string") return Response.json({ error: "listingId is required." }, { status: 400 });
  const { seller, listing } = await ownedListing(body.listingId);
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!listing) return Response.json({ error: "Not found." }, { status: 404 });
  const v = validateRequest(body);
  if (!v.ok) return Response.json({ errors: v.errors }, { status: 422 });

  const d = db(await envAsync());
  const mine = await d.select({ id: services.id, status: services.status, method: services.method, path: services.path }).from(services).where(eq(services.listingId, listing.id));
  const list = (x: unknown) => (Array.isArray(x) && x.length ? x.filter((y): y is string => typeof y === "string") : null);
  const byId = list(body.serviceIds), byKey = list(body.endpointKeys);
  const ids = (byId ? mine.filter((s) => byId.includes(s.id))
    : byKey ? mine.filter((s) => byKey.includes(`${s.method} ${s.path}`))
    : mine.filter((s) => s.status === "live")).map((s) => s.id);
  if (!ids.length) return Response.json({ error: "Pick at least one endpoint of this listing." }, { status: 422 });

  const existing = await d.select({ serviceId: reviews.serviceId, state: reviews.state }).from(reviews).where(inArray(reviews.serviceId, ids));
  const state = new Map(existing.map((r) => [r.serviceId, r.state]));
  const now = Math.floor(Date.now() / 1000);
  const fields = { ...v.value, state: "requested" as const, requestedAt: now, updatedAt: now };
  const requested: string[] = [];
  const skipped: string[] = [];
  const writes = [];
  for (const id of ids) {
    const cur = state.get(id) ?? null;
    if (!listerCan(cur).request) { skipped.push(id); continue; }
    requested.push(id);
    // A re-request after "reviewed" or "withdrawn" keeps the earlier reviewed details on the row,
    // but the endpoint shows "Review in progress" until HEY signs again.
    writes.push(cur
      ? d.update(reviews).set(fields).where(and(eq(reviews.serviceId, id), eq(reviews.listingId, listing.id)))
      : d.insert(reviews).values({ serviceId: id, listingId: listing.id, ...fields }));
  }
  if (writes.length) await d.batch(writes as [typeof writes[number], ...typeof writes]);
  return Response.json({ ok: true, requested, skipped });
}
