import { and, eq, ne } from "drizzle-orm";
import { payments, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { ownedListing, validateService, type ServiceInput } from "@/lib/server/services";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const d = db(await envAsync());
  const svc = await d.query.services.findFirst({ where: eq(services.id, id) });
  if (!svc) return { d, svc: null, seller: null } as const;
  const { seller, listing } = await ownedListing(svc.listingId);
  return { d, svc: listing ? svc : null, seller } as const;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { d, svc, seller } = await load((await params).id);
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!svc) return Response.json({ error: "Not found." }, { status: 404 });
  const v = validateService((await req.json()) as ServiceInput, svc);
  if (!v.ok) return Response.json({ errors: v.errors }, { status: 422 });
  const method = v.value.method ?? svc.method;
  const path = v.value.path ?? svc.path;
  const clash = await d.query.services.findFirst({
    where: and(eq(services.listingId, svc.listingId), eq(services.method, method), eq(services.path, path), ne(services.id, svc.id)),
  });
  if (clash) return Response.json({ errors: { path: `There is already a ${method} endpoint at ${path}.` } }, { status: 422 });
  await d.update(services).set({ ...v.value, updatedAt: Math.floor(Date.now() / 1000) }).where(eq(services.id, svc.id));
  return Response.json({ ok: true });
}

/**
 * Removes an endpoint. One with payments is paused instead, so the ledger
 * and receipts keep pointing at it.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { d, svc, seller } = await load((await params).id);
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!svc) return Response.json({ error: "Not found." }, { status: 404 });
  const paid = await d.query.payments.findFirst({ where: eq(payments.serviceId, svc.id), columns: { id: true } });
  if (paid) {
    await d.update(services).set({ status: "paused", updatedAt: Math.floor(Date.now() / 1000) }).where(eq(services.id, svc.id));
    return Response.json({ ok: true, paused: true });
  }
  await d.delete(services).where(eq(services.id, svc.id));
  return Response.json({ ok: true, deleted: true });
}
