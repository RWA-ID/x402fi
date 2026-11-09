import { eq, desc } from "drizzle-orm";
import { listings, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { currentSeller } from "@/lib/server/session";
import { validateListing, slugify, randomToken, type ListingInput } from "@/lib/server/listings";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";

export async function GET() {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const rows = await db(await envAsync()).select().from(listings).where(eq(listings.seller, seller)).orderBy(desc(listings.createdAt));
  return Response.json(rows.map(({ upstreamSecret: _s, ...l }) => l));
}

export async function POST(req: Request) {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const input = (await req.json()) as ListingInput & { publish?: boolean };
  const v = validateListing(input);
  if (!v.ok) return Response.json({ errors: v.errors }, { status: 422 });
  try {
    await assertSafeUrl(v.value.upstreamUrl);
  } catch (e) {
    return Response.json({ errors: { upstreamUrl: e instanceof UnsafeUrlError ? e.message : "Could not check that URL." } }, { status: 422 });
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
      pricing: "fixed",
      priceAtomic: v.value.priceAtomic,
      exampleRequest: v.value.exampleRequest,
      exampleResponse: v.value.exampleResponse,
    }),
  ]);
  return Response.json({ id, slug, upstreamSecret }, { status: 201 });
}
