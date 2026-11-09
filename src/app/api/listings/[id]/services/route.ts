import { asc, eq } from "drizzle-orm";
import { services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { ownedListing, validateService, type ServiceInput } from "@/lib/server/services";
import { nativeUrl, probeNative } from "@/lib/server/native";
import { listingScanMode, rescanListing } from "@/lib/server/textscan";
import { serviceBlockErrors } from "@/lib/textscan";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { seller, listing } = await ownedListing((await params).id);
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!listing) return Response.json({ error: "Not found." }, { status: 404 });
  const rows = await db(await envAsync()).select().from(services).where(eq(services.listingId, listing.id)).orderBy(asc(services.sortOrder));
  return Response.json(rows);
}

/** Adds an endpoint to a listing the seller owns. */
export async function POST(req: Request, { params }: Ctx) {
  const { seller, listing } = await ownedListing((await params).id);
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!listing) return Response.json({ error: "Not found." }, { status: 404 });
  const input = (await req.json()) as ServiceInput;
  const v = validateService({ method: "GET", path: "/", pricing: "fixed", ...input });
  if (!v.ok) return Response.json({ errors: v.errors }, { status: 422 });
  const d = db(await envAsync());
  const existing = await d.select({ method: services.method, path: services.path }).from(services).where(eq(services.listingId, listing.id));
  if (existing.some((s) => s.method === v.value.method && s.path === v.value.path)) {
    return Response.json({ errors: { path: `There is already a ${v.value.method} endpoint at ${v.value.path}.` } }, { status: 422 });
  }
  let nativeDescription: string | null = null;
  if (v.value.pricing === "native") {
    const p = await probeNative(nativeUrl(listing.upstreamUrl, v.value.path ?? "/", v.value.exampleRequest), v.value.method ?? "GET", v.value.method === "POST" ? v.value.exampleBody ?? "{}" : null, { fresh: true });
    if (!p.ok) return Response.json({ errors: { path: `That endpoint's 402 could not be read: ${p.reason}` } }, { status: 422 });
    v.value.priceAtomic = p.quote.amount;
    nativeDescription = p.quote.description;
  }
  if ((await listingScanMode()) === "block") {
    const errors = serviceBlockErrors(v.value, nativeDescription);
    if (errors) return Response.json({ errors }, { status: 422 });
  }
  const id = crypto.randomUUID();
  await d.insert(services).values({ id, listingId: listing.id, sortOrder: existing.length, ...v.value } as typeof services.$inferInsert);
  await rescanListing(listing.id);
  return Response.json({ id }, { status: 201 });
}
