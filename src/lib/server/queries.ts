import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { listings, payments, services, type Listing, type Service } from "@/db/schema";
import { db, envAsync } from "./env";

export type PublicService = Omit<Service, "quotePath" | "createdAt" | "updatedAt">;
export type PublicListing = Omit<Listing, "upstreamSecret" | "upstreamUrl"> & {
  calls: number;
  services: PublicService[];
  /** Cheapest live paid price, or null when every live endpoint is free. */
  fromAtomic: string | null;
  hasFree: boolean;
  hasQuote: boolean;
};

const publicCols = {
  id: listings.id, slug: listings.slug, seller: listings.seller, name: listings.name, summary: listings.summary,
  description: listings.description, category: listings.category, method: listings.method, priceAtomic: listings.priceAtomic,
  payTo: listings.payTo, identityName: listings.identityName, dailyCapAtomic: listings.dailyCapAtomic,
  exampleRequest: listings.exampleRequest, exampleResponse: listings.exampleResponse, status: listings.status,
  logoUrl: listings.logoUrl, websiteUrl: listings.websiteUrl, xHandle: listings.xHandle,
  createdAt: listings.createdAt, updatedAt: listings.updatedAt,
};

/**
 * Settled payments per listing. Written with explicit aliases: interpolating
 * ${payments.listingId} / ${listings.id} here makes drizzle emit bare
 * "listing_id" = "id", which inside the subquery both resolve to payments,
 * so every listing counted 0 (found 2026-11-08 after the first two payments).
 */
const callsCol = sql<number>`(select count(*) from "payments" "p" where "p"."listing_id" = "listings"."id" and "p"."status" = 'settled')`;

async function withServices(rows: Array<Omit<PublicListing, "services" | "fromAtomic" | "hasFree" | "hasQuote">>): Promise<PublicListing[]> {
  if (!rows.length) return [];
  const svc = await db(await envAsync())
    .select()
    .from(services)
    .where(inArray(services.listingId, rows.map((r) => r.id)))
    .orderBy(asc(services.sortOrder), asc(services.createdAt));
  return rows.map((r) => {
    const mine = svc.filter((s) => s.listingId === r.id).map(({ quotePath: _q, createdAt: _c, updatedAt: _u, ...s }) => s);
    const live = mine.filter((s) => s.status === "live");
    const paid = live.filter((s) => s.pricing === "fixed" && s.priceAtomic).map((s) => BigInt(s.priceAtomic!));
    const quoteFloors = live.filter((s) => s.pricing === "quote" || s.pricing === "contract").length;
    const min = paid.length ? paid.reduce((a, b) => (b < a ? b : a)) : null;
    return {
      ...r,
      services: mine,
      fromAtomic: min !== null ? min.toString() : null,
      hasFree: live.some((s) => s.pricing === "free"),
      hasQuote: quoteFloors > 0,
    };
  });
}

/** Live listings, or [] if the DB is unreachable (pages still render). */
export async function liveListings(limit = 60): Promise<PublicListing[]> {
  try {
    const rows = await db(await envAsync())
      .select({ ...publicCols, calls: callsCol })
      .from(listings)
      .where(eq(listings.status, "live"))
      .orderBy(desc(callsCol), desc(listings.createdAt))
      .limit(limit);
    return await withServices(rows);
  } catch (e) {
    console.error("liveListings", e);
    return [];
  }
}

export async function listingBySlug(slug: string): Promise<PublicListing | null> {
  const [row] = await db(await envAsync())
    .select({ ...publicCols, calls: callsCol })
    .from(listings)
    .where(eq(listings.slug, slug))
    .limit(1);
  if (!row) return null;
  return (await withServices([row]))[0];
}
