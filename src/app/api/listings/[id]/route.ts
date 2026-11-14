import { and, eq } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { listings } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { currentSeller } from "@/lib/server/session";
import { randomToken } from "@/lib/server/listings";
import { sellerHoldsNameError } from "@/lib/server/nameHolder";
import { parseLogo, parseWebsite, parseXHandle, ProfileInputError } from "@/lib/profile";

type Ctx = { params: Promise<{ id: string }> };

/** Owner actions: status, payout rotation, identity name, secret rotation. */
export async function PATCH(req: Request, { params }: Ctx) {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as {
    status?: string; payTo?: string; identityName?: string | null; rotateSecret?: boolean;
    logoUrl?: string | null; websiteUrl?: string | null; xHandle?: string | null;
  };
  const patch: Partial<typeof listings.$inferInsert> = { updatedAt: Math.floor(Date.now() / 1000) };
  if (body.status) {
    if (!["live", "paused"].includes(body.status)) return Response.json({ error: "bad status" }, { status: 400 });
    patch.status = body.status as "live" | "paused";
  }
  if (body.payTo !== undefined) {
    if (!isAddress(body.payTo, { strict: false })) return Response.json({ error: "Enter a valid 0x address." }, { status: 422 });
    patch.payTo = getAddress(body.payTo);
  }
  if (body.identityName !== undefined) {
    const n = body.identityName?.trim().toLowerCase() || null;
    if (n && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(n)) return Response.json({ error: "Use a full name like acme.402api.eth." }, { status: 422 });
    if (n) {
      // Only a name the signed-in wallet holds (no borrowing coinbase.eth).
      const held = await sellerHoldsNameError(await envAsync(), n, seller);
      if (held) return Response.json({ error: held.error }, { status: held.status });
    }
    patch.identityName = n;
  }
  try {
    // Stored as entered (validated); parseLogo maps ipfs:// at display time.
    if (body.logoUrl !== undefined) patch.logoUrl = parseLogo(body.logoUrl) ? (body.logoUrl ?? "").trim() : null;
    if (body.websiteUrl !== undefined) patch.websiteUrl = parseWebsite(body.websiteUrl);
    if (body.xHandle !== undefined) patch.xHandle = parseXHandle(body.xHandle);
  } catch (e) {
    if (e instanceof ProfileInputError) return Response.json({ error: e.message }, { status: 422 });
    throw e;
  }
  let upstreamSecret: string | undefined;
  if (body.rotateSecret) patch.upstreamSecret = upstreamSecret = randomToken();
  const r = await db(await envAsync())
    .update(listings)
    .set(patch)
    .where(and(eq(listings.id, id), eq(listings.seller, seller)))
    .returning({ id: listings.id });
  if (!r.length) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true, upstreamSecret });
}
