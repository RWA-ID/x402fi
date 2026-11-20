/**
 * Try it for a native listing: the seller runs its own x402 paywall, so the buyer pays the
 * seller directly. Browsers can't call most sellers' APIs (no CORS, and the PAYMENT-* headers
 * are not exposed), so this route passes the visitor's request through, payment header included.
 *
 * It only ever reaches the URL x402Fi already lists for that endpoint: the path is fixed from
 * the listing, the visitor supplies only the query string (and a POST body). The SSRF guard
 * applies, redirects are not followed, and x402Fi never touches the money: the signed
 * authorization pays the seller's own wallet, and the seller settles it.
 */
import { and, eq } from "drizzle-orm";
import { listings, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { nativeUrl } from "@/lib/server/native";
import { parseExample } from "@/lib/x402/bazaar";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

const MAX_BODY = 1_000_000; // request
const MAX_RESPONSE = 5_000_000;
/** Request headers passed to the seller; everything else (cookies included) stays here. */
const FORWARD = ["content-type", "accept", "payment-signature", "x-payment"];
/** Response headers passed back to the browser. */
const RETURN = ["content-type", "payment-required", "payment-response", "x-payment-response"];

type Ctx = { params: Promise<{ serviceId: string }> };

async function handle(req: Request, { params }: Ctx): Promise<Response> {
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
  const { serviceId } = await params;
  const [row] = await db(await envAsync())
    .select({ method: services.method, path: services.path, example: services.exampleRequest, upstreamUrl: listings.upstreamUrl })
    .from(services)
    .innerJoin(listings, eq(services.listingId, listings.id))
    .where(and(eq(services.id, serviceId), eq(services.pricing, "native"), eq(services.status, "live"), eq(listings.status, "live")))
    .limit(1);
  if (!row) return fail(404, "No live native endpoint here.");
  if (req.method !== (row.method ?? "GET")) return fail(405, `This endpoint takes ${row.method}.`);

  // The listed URL: the endpoint's path plus any sub-path from its example. The visitor's query
  // replaces the example's query; nothing else from the visitor shapes the URL.
  const { subPath } = parseExample(row.path ?? "/", row.example);
  const target = new URL(nativeUrl(row.upstreamUrl, row.path ?? "/", subPath || null));
  target.search = new URL(req.url).search;
  try {
    await assertSafeUrl(target.toString());
  } catch (e) {
    return fail(422, e instanceof UnsafeUrlError ? e.message : "Could not check the seller's URL.");
  }

  const headers = new Headers({ "user-agent": "x402Fi-try/1 (+https://x402fi.dev)" });
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  let body: ArrayBuffer | undefined;
  if (req.method === "POST") {
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY) return fail(413, "Request body over 1 MB.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: req.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    return fail(502, (e as Error).name === "TimeoutError" ? "The seller did not answer within 30 seconds." : "Could not reach the seller.");
  }
  if (upstream.status >= 300 && upstream.status < 400) return fail(502, "The seller answered with a redirect, which Try it does not follow.");
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_RESPONSE) return fail(502, "The seller's response is over 5 MB.");

  const out = new Headers({ "cache-control": "no-store", "x-x402fi-native-url": target.toString() });
  for (const h of RETURN) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(bytes, { status: upstream.status, headers: out });
}

export const GET = handle;
export const POST = handle;
