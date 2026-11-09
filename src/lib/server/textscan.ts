import "server-only";
import { eq } from "drizzle-orm";
import { listings, services } from "@/db/schema";
import { scanFields, scanMode, type ScanMode, type TextScanResult } from "@/lib/textscan";
import { db, envAsync } from "./env";
import { nativeUrl, probeNative } from "./native";

export async function listingScanMode(): Promise<ScanMode> {
  return scanMode((await envAsync()).LISTING_TEXT_SCAN);
}

type ListingText = Pick<typeof listings.$inferSelect, "name" | "summary" | "description" | "exampleRequest" | "exampleResponse">;
type ServiceText = Pick<typeof services.$inferSelect, "name" | "summary" | "method" | "path" | "exampleBody" | "exampleRequest" | "exampleResponse">;

/** Every seller-written string on a listing, keyed by where it lives. */
export function listingTextFields(l: ListingText, svcs: ServiceText[], nativeDescriptions: Record<string, string | null> = {}) {
  const f: Record<string, string | null> = {
    "listing.name": l.name,
    "listing.summary": l.summary,
    "listing.description": l.description,
    "listing.exampleRequest": l.exampleRequest,
    "listing.exampleResponse": l.exampleResponse,
  };
  for (const s of svcs) {
    const at = `service[${s.method} ${s.path}]`;
    f[`${at}.name`] = s.name;
    f[`${at}.summary`] = s.summary;
    f[`${at}.exampleBody`] = s.exampleBody;
    f[`${at}.exampleRequest`] = s.exampleRequest;
    f[`${at}.exampleResponse`] = s.exampleResponse;
  }
  for (const [at, d] of Object.entries(nativeDescriptions)) f[`native[${at}].description`] = d;
  return f;
}

/**
 * Rescans a whole listing (its text, every endpoint's text, and each live native
 * endpoint's own 402 description from the cached probe) and stores the result.
 * Flag-mode bookkeeping: it never throws and never blocks the write that called it.
 */
export async function rescanListing(listingId: string): Promise<TextScanResult | null> {
  try {
    if ((await listingScanMode()) === "off") return null;
    const d = db(await envAsync());
    const l = await d.query.listings.findFirst({ where: eq(listings.id, listingId) });
    if (!l) return null;
    const svcs = await d.select().from(services).where(eq(services.listingId, listingId));
    const native: Record<string, string | null> = {};
    for (const s of svcs) {
      if (s.pricing !== "native" || s.status !== "live") continue;
      const p = await probeNative(nativeUrl(l.upstreamUrl, s.path, s.exampleRequest), s.method, s.method === "POST" ? s.exampleBody ?? "{}" : null);
      if (p.ok) native[`${s.method} ${s.path}`] = p.quote.description;
    }
    const r = scanFields(listingTextFields(l, svcs, native));
    await d.update(listings).set({ textScan: JSON.stringify(r) }).where(eq(listings.id, listingId));
    if (r.decision !== "allow") {
      // Workers observability picks this up; filter on event = listing_text_scan.
      console.warn(JSON.stringify({ event: "listing_text_scan", listingId, slug: l.slug, status: l.status, decision: r.decision, codes: r.findings.map((f) => `${f.code}@${f.field}`) }));
    }
    return r;
  } catch (e) {
    console.error(JSON.stringify({ event: "listing_text_scan_error", listingId, error: (e as Error).message }));
    return null;
  }
}
