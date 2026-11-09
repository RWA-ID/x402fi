import "server-only";
import { and, eq } from "drizzle-orm";
import { listings, services } from "@/db/schema";
import { usdToAtomic, MIN_PRICE_ATOMIC, MIN_PRICE_LABEL } from "@/lib/x402/money";
import { normalizePath } from "@/lib/gateway/services";
import { db, envAsync } from "./env";
import { currentSeller } from "./session";

export interface ServiceInput {
  name?: string;
  summary?: string;
  method?: string;
  path?: string;
  pricing?: "free" | "fixed" | "quote";
  price?: string | null;
  quotePath?: string | null;
  maxPrice?: string | null;
  exampleRequest?: string | null;
  exampleResponse?: string | null;
  sortOrder?: number;
  status?: "live" | "paused";
}

type Patch = Partial<typeof services.$inferInsert>;

const MAX_PRICE = 1_000_000_000n; // $1,000

/** Validates a full service (create) or a partial one merged onto the current row (edit). */
export function validateService(i: ServiceInput, current?: Patch): { ok: true; value: Patch } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const out: Patch = {};
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const merged = { ...current } as Patch;

  if (i.name !== undefined) {
    if (s(i.name).length < 2 || s(i.name).length > 60) e.name = "Use 2 to 60 characters.";
    out.name = s(i.name);
  }
  if (i.summary !== undefined) {
    if (s(i.summary).length > 200) e.summary = "Keep it under 200 characters.";
    out.summary = s(i.summary);
  }
  if (i.method !== undefined) {
    if (!["GET", "POST"].includes(i.method)) e.method = "GET or POST.";
    out.method = i.method;
  }
  if (i.path !== undefined) {
    const p = normalizePath(s(i.path));
    if (!/^\/[A-Za-z0-9._~\-/]*$/.test(p) || p.length > 120) e.path = "Use a plain path like /register (letters, numbers, - _ . / only).";
    out.path = p;
  }
  if (i.pricing !== undefined) {
    if (!["free", "fixed", "quote"].includes(i.pricing)) e.pricing = "Pick free, fixed or quoted.";
    out.pricing = i.pricing;
  }
  const money = (k: "price" | "maxPrice", v: string | null | undefined) => {
    if (v === undefined) return undefined;
    if (v === null || s(v) === "") return null;
    try {
      const a = usdToAtomic(s(v));
      if (a < MIN_PRICE_ATOMIC) e[k] = `Minimum is ${MIN_PRICE_LABEL}.`;
      else if (a > MAX_PRICE) e[k] = "Maximum is $1,000.";
      return a.toString();
    } catch (err) {
      e[k] = (err as Error).message;
      return undefined;
    }
  };
  const price = money("price", i.price);
  if (price !== undefined) out.priceAtomic = price;
  const max = money("maxPrice", i.maxPrice);
  if (max !== undefined) out.maxPriceAtomic = max;
  if (i.quotePath !== undefined) {
    const qp = s(i.quotePath) ? normalizePath(s(i.quotePath)) : null;
    if (qp && (!/^\/[A-Za-z0-9._~\-/]*$/.test(qp) || qp.length > 120)) e.quotePath = "Use a plain path like /quote/register.";
    out.quotePath = qp;
  }
  if (i.exampleRequest !== undefined) out.exampleRequest = s(i.exampleRequest).slice(0, 300) || null;
  if (i.exampleResponse !== undefined) out.exampleResponse = s(i.exampleResponse).slice(0, 4000) || null;
  if (i.sortOrder !== undefined) out.sortOrder = Math.max(0, Math.min(999, Math.floor(Number(i.sortOrder) || 0)));
  if (i.status !== undefined) {
    if (!["live", "paused"].includes(i.status)) e.status = "live or paused.";
    out.status = i.status;
  }

  // Cross-field rules on the merged result.
  Object.assign(merged, out);
  if (!merged.name) e.name ??= "Name the endpoint.";
  if (merged.pricing === "fixed" && !merged.priceAtomic) e.price ??= "Set a price per call.";
  if (merged.pricing === "quote") {
    if (!merged.maxPriceAtomic) e.maxPrice ??= "Set the most a single call can cost. Buyers see this ceiling.";
    if (!merged.quotePath) e.quotePath ??= "Set the path x402Fi asks for the price.";
  }
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, value: out };
}

/** The signed-in seller's listing, or null. */
export async function ownedListing(listingId: string) {
  const seller = await currentSeller();
  if (!seller) return { seller: null, listing: null } as const;
  const d = db(await envAsync());
  const listing = await d.query.listings.findFirst({ where: and(eq(listings.id, listingId), eq(listings.seller, seller)) });
  return { seller, listing: listing ?? null } as const;
}
