import { eq, desc } from "drizzle-orm";
import { listings, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { currentSeller } from "@/lib/server/session";
import { validateListing, slugify, randomToken, type ListingInput } from "@/lib/server/listings";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";
import { probeNative } from "@/lib/server/native";
import { listingScanMode, listingTextFields, rescanListing } from "@/lib/server/textscan";
import { blockErrors, scanFields } from "@/lib/textscan";

export async function GET() {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const rows = await db(await envAsync()).select().from(listings).where(eq(listings.seller, seller)).orderBy(desc(listings.createdAt));
  return Response.json(rows.map(({ upstreamSecret: _s, textScan: _t, ...l }) => l));
}

export async function POST(req: Request) {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const input = (await req.json()) as ListingInput & { publish?: boolean; native?: boolean; exampleBody?: string | null };

  // A native endpoint already charges with x402: its price and payout wallet come from its
  // own 402, never from what was typed, and x402Fi only lists it (no proxy, no gas, so the
  // $0.01 settlement minimum does not apply).
  let native: { amount: string; payTo: string; description: string | null } | null = null;
  if (input.native) {
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
  const v = validateListing(input);
  if (!v.ok) return Response.json({ errors: v.errors }, { status: 422 });
  if (native) v.value.priceAtomic = native.amount;
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
  // The wizard creates a project with its first endpoint: fixed price, every path.
  await d.batch([
    d.insert(listings).values({ id, slug, seller, upstreamSecret, status: input.publish ? "live" : "draft", ...v.value }),
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
