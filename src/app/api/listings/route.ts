import { eq, desc } from "drizzle-orm";
import { getAddress } from "viem";
import { listings, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { currentSeller } from "@/lib/server/session";
import { validateListing, slugify, randomToken, type ListingInput } from "@/lib/server/listings";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";
import { nativeUrl, probeNative } from "@/lib/server/native";
import { validateService } from "@/lib/server/services";
import { listingScanMode, listingTextFields, rescanListing } from "@/lib/server/textscan";
import { blockErrors, scanFields, serviceBlockErrors } from "@/lib/textscan";

const MAX_ENDPOINTS = 20;

export interface EndpointInput {
  name?: string;
  summary?: string;
  method?: "GET" | "POST";
  path?: string;
  price?: string | null;
  /** Proxied listings: "free" forwards without payment. Omitted = fixed price. */
  pricing?: "free" | "fixed";
  exampleRequest?: string | null;
  exampleBody?: string | null;
  exampleResponse?: string | null;
}

export async function GET() {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const rows = await db(await envAsync()).select().from(listings).where(eq(listings.seller, seller)).orderBy(desc(listings.createdAt));
  return Response.json(rows.map(({ upstreamSecret: _s, textScan: _t, ...l }) => l));
}

export async function POST(req: Request) {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const input = (await req.json()) as ListingInput & { publish?: boolean; native?: boolean; exampleBody?: string | null; endpoints?: EndpointInput[] };

  // Endpoints from the wizard (2026-11): several in one publish. Without them, the old
  // single-endpoint shape still works (one endpoint at "/", every path).
  const eps = Array.isArray(input.endpoints) ? input.endpoints.slice(0, MAX_ENDPOINTS) : [];
  if (Array.isArray(input.endpoints) && input.endpoints.length > MAX_ENDPOINTS) {
    return Response.json({ errors: { endpoints: `Up to ${MAX_ENDPOINTS} endpoints per listing.` } }, { status: 422 });
  }
  const isFree = (ep: EndpointInput) => !input.native && ep.pricing === "free";
  if (eps.length && !input.native && eps.every(isFree)) {
    return Response.json({ errors: { endpoints: "At least one endpoint must be paid." } }, { status: 422 });
  }
  if (eps.length) {
    // The listing-level price/method/example mirror the first endpoint (shown on cards);
    // the price comes from the first PAID one (it is replaced by the cheapest below).
    const first = eps[0]!;
    input.method = first.method ?? "GET";
    input.price = input.native ? "0.01" : eps.find((e) => !isFree(e))?.price ?? "";
    input.exampleRequest = first.exampleRequest ?? "";
    input.exampleBody = first.exampleBody ?? null;
  }

  // A native endpoint already charges with x402: its price and payout wallet come from its
  // own 402, never from what was typed, and x402Fi only lists it (no proxy, no gas, so the
  // $0.01 settlement minimum does not apply).
  let native: { amount: string; payTo: string; description: string | null } | null = null;
  if (input.native && !eps.length) {
    const method = input.method === "POST" ? "POST" : "GET";
    const body = method === "POST" ? (input.exampleBody?.trim() || "{}") : null;
    if (body) { try { JSON.parse(body); } catch { return Response.json({ errors: { upstreamUrl: "The example body must be valid JSON." } }, { status: 422 }); } }
    const ex = (input.exampleRequest ?? "").trim();
    const url = ex.startsWith("?") || ex.startsWith("/") ? input.upstreamUrl.replace(/\/$/, "") + ex : input.upstreamUrl;
    const p = await probeNative(url, method, body, { fresh: true });
    if (!p.ok) return Response.json({ errors: { upstreamUrl: `Your endpoint's 402 could not be read: ${p.reason}` } }, { status: 422 });
    native = { amount: p.quote.amount, payTo: p.quote.payTo, description: p.quote.description };
    input.payTo = p.quote.payTo;
    input.price = "0.01"; // placeholder for validation only; replaced by the probed amount below
  }
  if (input.native && eps.length) input.payTo ||= "0x0000000000000000000000000000000000000001"; // replaced by the probed payTo below
  const v = validateListing(input);
  if (!v.ok) return Response.json({ errors: v.errors }, { status: 422 });
  if (native) v.value.priceAtomic = native.amount;

  // Validate (and for native, probe) every endpoint before anything is written.
  type Row = Omit<typeof services.$inferInsert, "id" | "listingId">;
  const rows: Row[] = [];
  const endpointErrors: Record<string, string> = {};
  const nativeDescriptions: Record<string, string | null> = {};
  for (const [i, ep] of eps.entries()) {
    const sv = validateService({
      name: ep.name?.trim() || `${ep.method ?? "GET"} ${ep.path || "/"}`,
      summary: ep.summary ?? "",
      method: ep.method ?? "GET",
      path: ep.path || "/",
      pricing: input.native ? "native" : isFree(ep) ? "free" : "fixed",
      price: input.native || isFree(ep) ? null : ep.price,
      exampleRequest: ep.exampleRequest ?? null,
      exampleBody: ep.exampleBody ?? null,
      exampleResponse: ep.exampleResponse ?? null,
    });
    if (!sv.ok) { for (const [k, m] of Object.entries(sv.errors)) endpointErrors[`endpoints.${i}.${k}`] = m; continue; }
    const key = `${sv.value.method} ${sv.value.path}`;
    if (rows.some((r) => `${r.method} ${r.path}` === key)) { endpointErrors[`endpoints.${i}.path`] = `${key} is listed twice.`; continue; }
    if (input.native) {
      const body = sv.value.method === "POST" ? (ep.exampleBody?.trim() || "{}") : null;
      const p = await probeNative(nativeUrl(v.value.upstreamUrl, sv.value.path ?? "/", sv.value.exampleRequest ?? null), sv.value.method ?? "GET", body, { fresh: true });
      if (!p.ok) { endpointErrors[`endpoints.${i}.path`] = `${key}: its 402 could not be read (${p.reason}).`; continue; }
      if (i === 0) { v.value.payTo = getAddress(p.quote.payTo); v.value.priceAtomic = p.quote.amount; }
      else if (getAddress(p.quote.payTo) !== v.value.payTo) { endpointErrors[`endpoints.${i}.path`] = `${key} pays a different wallet (${p.quote.payTo}) than ${eps[0]!.path || "/"}. One listing, one payout wallet.`; continue; }
      sv.value.priceAtomic = p.quote.amount;
      sv.value.exampleBody = body;
      nativeDescriptions[key] = p.quote.description;
    }
    rows.push({ ...sv.value, sortOrder: i } as Row);
  }
  if (Object.keys(endpointErrors).length) return Response.json({ errors: endpointErrors }, { status: 422 });
  if (rows.length && !input.native) {
    // Cards show "from $x": the cheapest PAID endpoint (a free one has no price).
    v.value.priceAtomic = rows.filter((r) => r.pricing === "fixed" && r.priceAtomic).map((r) => BigInt(r.priceAtomic!)).reduce((a, b) => (b < a ? b : a)).toString();
  }
  try {
    await assertSafeUrl(v.value.upstreamUrl);
  } catch (e) {
    return Response.json({ errors: { upstreamUrl: e instanceof UnsafeUrlError ? e.message : "Could not check that URL." } }, { status: 422 });
  }
  if ((await listingScanMode()) === "block") {
    const fields = listingTextFields(
      { ...v.value, exampleRequest: v.value.exampleRequest ?? null, exampleResponse: v.value.exampleResponse ?? null },
      [],
      native ? { [`${v.value.method} /`]: native.description } : {},
    );
    const errors = blockErrors(scanFields(fields), (f) => (f.startsWith("native[") ? "upstreamUrl" : f.replace(/^listing\./, "")));
    if (errors) return Response.json({ errors }, { status: 422 });
    for (const [i, r] of rows.entries()) {
      const se = serviceBlockErrors(r, nativeDescriptions[`${r.method} ${r.path}`] ?? null);
      if (se) return Response.json({ errors: Object.fromEntries(Object.entries(se).map(([k, m]) => [`endpoints.${i}.${k}`, m])) }, { status: 422 });
    }
  }
  const d = db(await envAsync());
  const base = slugify(v.value.name);
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const taken = await d.query.listings.findFirst({ where: eq(listings.slug, slug), columns: { id: true } });
    if (!taken) break;
    slug = `${base}-${randomToken(2)}`;
  }
  const id = crypto.randomUUID();
  const upstreamSecret = randomToken();
  const listingRow = d.insert(listings).values({ id, slug, seller, upstreamSecret, status: input.publish ? "live" : "draft", ...v.value });
  if (rows.length) {
    await d.batch([listingRow, ...rows.map((r) => d.insert(services).values({ ...r, id: crypto.randomUUID(), listingId: id } as typeof services.$inferInsert))]);
    await rescanListing(id);
    return Response.json({ id, slug, upstreamSecret }, { status: 201 });
  }
  // Legacy single-endpoint shape: one endpoint, fixed price, every path.
  await d.batch([
    listingRow,
    d.insert(services).values({
      id: crypto.randomUUID(),
      listingId: id,
      name: v.value.name,
      summary: v.value.summary,
      method: v.value.method,
      path: "/",
      pricing: native ? "native" : "fixed",
      priceAtomic: v.value.priceAtomic, // for native: the probed price, informational
      exampleBody: native && v.value.method === "POST" ? (input.exampleBody?.trim() || "{}") : null,
      exampleRequest: v.value.exampleRequest,
      exampleResponse: v.value.exampleResponse,
    }),
  ]);
  await rescanListing(id);
  return Response.json({ id, slug, upstreamSecret }, { status: 201 });
}
