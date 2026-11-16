import { eq } from "drizzle-orm";
import { reviews } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { ownedListing } from "@/lib/server/services";
import { COMMIT_RE, listerCan } from "@/lib/reviews";

type Ctx = { params: Promise<{ serviceId: string }> };

/**
 * The lister's moves on one endpoint's review:
 *   { action: "fixes_submitted", commit, note? }  after HEY sent findings
 *   { action: "cancel" }                           withdraw a request still in progress
 * "reviewed" is never set here: only HEY's signature sets it (POST /api/reviews/hey).
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = (await params).serviceId;
  const d = db(await envAsync());
  const row = await d.query.reviews.findFirst({ where: eq(reviews.serviceId, id) });
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  const { seller, listing } = await ownedListing(row.listingId);
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!listing) return Response.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; commit?: unknown; note?: unknown };
  const can = listerCan(row.state);
  const now = Math.floor(Date.now() / 1000);
  if (body.action === "fixes_submitted") {
    if (!can.submitFixes) return Response.json({ error: "Fixes can be submitted once HEY has sent findings." }, { status: 409 });
    const commit = typeof body.commit === "string" ? body.commit.trim().toLowerCase() : "";
    if (!COMMIT_RE.test(commit)) return Response.json({ errors: { commit: "The commit with the fixes: 7 to 64 hex characters." } }, { status: 422 });
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
    await d.update(reviews).set({ state: "fixes_submitted", commit, note: note ?? row.note, updatedAt: now }).where(eq(reviews.serviceId, id));
    return Response.json({ ok: true, state: "fixes_submitted" });
  }
  if (body.action === "cancel") {
    if (!can.cancel) return Response.json({ error: "Only a review in progress can be cancelled." }, { status: 409 });
    // Back to "none" when nothing was ever reviewed; otherwise back to the last signed outcome
    // is not possible (HEY's re-test was for a different commit), so the row becomes "withdrawn".
    if (row.reviewedAt) await d.update(reviews).set({ state: "withdrawn", updatedAt: now }).where(eq(reviews.serviceId, id));
    else await d.delete(reviews).where(eq(reviews.serviceId, id));
    return Response.json({ ok: true });
  }
  return Response.json({ error: "action must be fixes_submitted or cancel." }, { status: 400 });
}
