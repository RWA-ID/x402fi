import { asc, eq } from "drizzle-orm";
import { services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { ownedListing, validateService, type ServiceInput } from "@/lib/server/services";

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
  const id = crypto.randomUUID();
  await d.insert(services).values({ id, listingId: listing.id, sortOrder: existing.length, ...v.value } as typeof services.$inferInsert);
  return Response.json({ id }, { status: 201 });
}
