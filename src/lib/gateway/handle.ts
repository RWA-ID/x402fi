import "server-only";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { getAddress } from "viem";
import { listings, payments, services, type Listing, type Service } from "@/db/schema";
import { buildPaymentRequired, buildRequirements } from "@/lib/x402/requirements";
import { verifyPayment, settlePayment } from "@/lib/x402/facilitator";
import { decodeHeader, encodeHeader, HEADERS } from "@/lib/x402/encoding";
import type { PaymentPayload, SettleResponse } from "@/lib/x402/types";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";
import { db, envAsync } from "@/lib/server/env";
import { robinhoodClient, settlementWallet } from "@/lib/server/clients";
import { GET as demoEcho } from "@/app/api/demo/echo/route";
import { allowedMethods, labelFromPath, matchService, parseQuote, quoteRequestPath } from "./services";
import { parseContractConfig, quoteLabel, settleViaContract } from "@/lib/x402/contract";
import { txUrl } from "@/lib/chains";

/** Upstream URL for the built-in demo service; served in-process (a Worker cannot fetch its own workers.dev host). */
export const DEMO_UPSTREAM = "internal:demo";

const UPSTREAM_TIMEOUT_MS = 25_000;
const QUOTE_TIMEOUT_MS = 8_000;
const MAX_BODY = 1_000_000;
const HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
  "host", "cookie", "authorization", "content-length", "cf-connecting-ip", "x-forwarded-for", "x-real-ip",
  "payment-signature", "x-payment",
]);
const EXPOSE = "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, X-X402Fi-Receipt";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-expose-headers": EXPOSE, ...headers },
  });

/** `payTo` defaults to the listing's payout wallet; a contract endpoint is paid to its contract. */
function challenge(listing: Listing, service: Service, amountAtomic: bigint, resourceUrl: string, error?: string, payTo: string = listing.payTo) {
  const pr = buildPaymentRequired({
    url: resourceUrl,
    description: service.summary || listing.summary,
    amountAtomic,
    payTo: getAddress(payTo),
    identityName: listing.identityName,
    error,
  });
  return json(402, pr, { [HEADERS.required]: encodeHeader(pr) });
}

function readPayment(req: Request): PaymentPayload | null | "malformed" {
  for (const h of HEADERS.payment) {
    const v = req.headers.get(h);
    if (v) {
      try {
        return decodeHeader<PaymentPayload>(v);
      } catch {
        return "malformed";
      }
    }
  }
  return null;
}

function startOfUtcDay() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

/** upstream base + request path + query, as the gateway always forwards. */
function upstreamTarget(listing: Listing, requestPath: string, search: string): URL {
  const target = new URL(listing.upstreamUrl);
  const base = target.pathname.replace(/\/$/, "");
  const segs = requestPath.split("/").filter(Boolean).map(encodeURIComponent);
  target.pathname = base + (segs.length ? "/" + segs.join("/") : "") || "/";
  new URLSearchParams(search).forEach((val, key) => target.searchParams.append(key, val));
  return target;
}

/** Calls the seller's API. Throws UnsafeUrlError / TimeoutError / network errors. */
async function forward(listing: Listing, req: Request, requestPath: string, search: string, payer: string | null, body: ArrayBuffer | undefined): Promise<Response> {
  if (listing.upstreamUrl === DEMO_UPSTREAM) {
    const h = new Headers(payer ? { "x-x402fi-payer": payer } : {});
    return demoEcho(new Request(`https://demo.local/${search}`, { headers: h }));
  }
  const target = upstreamTarget(listing, requestPath, search);
  await assertSafeUrl(target.toString());
  const headers = new Headers();
  req.headers.forEach((val, key) => {
    if (!HOP.has(key.toLowerCase()) && !key.toLowerCase().startsWith("cf-")) headers.set(key, val);
  });
  headers.set("x-x402fi-secret", listing.upstreamSecret);
  if (payer) headers.set("x-x402fi-payer", payer);
  return fetch(target, { method: req.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
}

type Price = { ok: true; amountAtomic: bigint } | { ok: false; response: Response };

/** The price of this request: fixed, or quoted by the seller within the ceiling. */
async function priceOf(listing: Listing, service: Service, requestPath: string, search: string): Promise<Price> {
  if (service.pricing === "fixed") {
    if (!service.priceAtomic) return { ok: false, response: json(503, { error: "This service has no price set." }) };
    return { ok: true, amountAtomic: BigInt(service.priceAtomic) };
  }
  // quote
  if (listing.upstreamUrl === DEMO_UPSTREAM) return { ok: false, response: json(503, { error: "Quotes are not available for this service." }) };
  try {
    const target = upstreamTarget(listing, quoteRequestPath(service, requestPath), search);
    await assertSafeUrl(target.toString());
    const r = await fetch(target, {
      method: "GET",
      headers: { "x-x402fi-secret": listing.upstreamSecret, "x-x402fi-quote": "1", accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    });
    const body = await r.json().catch(() => null);
    const q = parseQuote(body, service.maxPriceAtomic);
    if (q.ok) return q;
    // A seller saying "not available" (e.g. a name is taken) is an answer, not an outage.
    const sellerSaidNo = !q.reason.startsWith("quote_");
    return {
      ok: false,
      response: json(sellerSaidNo ? 409 : 502, sellerSaidNo
        ? { error: q.reason }
        : { error: "The service could not price this request. Nothing was charged.", reason: q.reason }),
    };
  } catch (err) {
    const msg = err instanceof UnsafeUrlError ? err.message : (err as Error).name === "TimeoutError" ? "quote_timeout" : "quote_unreachable";
    return { ok: false, response: json(502, { error: "The service could not price this request. Nothing was charged.", reason: msg }) };
  }
}

export async function handleGateway(req: Request, slug: string, path: string[]): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, payment-signature, x-payment",
        "access-control-expose-headers": EXPOSE,
      },
    });
  }
  const e = await envAsync();
  const d = db(e);
  const listing = await d.query.listings.findFirst({ where: eq(listings.slug, slug) });
  if (!listing || listing.status === "draft") return json(404, { error: "No service at this address." });
  if (listing.status === "paused") return json(503, { error: "This service is paused by its owner." });

  const incoming = new URL(req.url);
  const requestPath = "/" + path.join("/");
  const all = await d.select().from(services).where(eq(services.listingId, listing.id)).orderBy(asc(services.sortOrder));
  const service = matchService(all, req.method, requestPath);
  if (!service) {
    const allow = allowedMethods(all, requestPath);
    return allow.length
      ? json(405, { error: `This endpoint accepts ${allow.join(", ")}.` }, { allow: allow.join(", ") })
      : json(404, { error: "No endpoint at this path.", endpoints: all.filter((s) => s.status === "live").map((s) => `${s.method} /g/${slug}${s.path === "/" ? "" : s.path}`) });
  }

  const resourceUrl = `${incoming.origin}/g/${slug}${path.length ? "/" + path.join("/") : ""}`;
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();
  if (body && body.byteLength > MAX_BODY) return json(413, { error: "Request body too large (1 MB max). Nothing was charged." });

  // Free endpoints: forwarded as is. No payment, no ledger row.
  if (service.pricing === "free") {
    try {
      const up = await forward(listing, req, requestPath, incoming.search, null, body);
      const out = new Headers();
      up.headers.forEach((val, key) => {
        if (!HOP.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie" && key.toLowerCase() !== "content-encoding") out.set(key, val);
      });
      out.set("access-control-allow-origin", "*");
      return new Response(req.method === "HEAD" ? null : await up.arrayBuffer(), { status: up.status, headers: out });
    } catch (err) {
      const msg = err instanceof UnsafeUrlError ? err.message : (err as Error).name === "TimeoutError" ? "upstream_timeout" : "upstream_unreachable";
      return json(502, { error: "The service did not answer.", detail: msg });
    }
  }

  if (service.pricing === "contract") return handleContract(req, e, d, listing, service, requestPath, resourceUrl);

  // Paid endpoints: price first (quoted prices are fetched again on the paid
  // request, so the signed amount must match the seller's current quote).
  const price = await priceOf(listing, service, requestPath, incoming.search);
  if (!price.ok) return price.response;
  const amount = price.amountAtomic;

  const payment = readPayment(req);
  if (payment === null) return challenge(listing, service, amount, resourceUrl);
  if (payment === "malformed") return challenge(listing, service, amount, resourceUrl, "malformed_payment_header");

  if (listing.dailyCapAtomic) {
    const [{ total }] = await d
      .select({ total: sql<string>`coalesce(sum(cast(${payments.amountAtomic} as integer)), 0)` })
      .from(payments)
      .where(and(eq(payments.listingId, listing.id), eq(payments.status, "settled"), gte(payments.createdAt, startOfUtcDay())));
    if (BigInt(total) + amount > BigInt(listing.dailyCapAtomic)) {
      return json(429, { error: "This service has reached its daily limit. Try again tomorrow (UTC)." });
    }
  }

  const required = buildRequirements({ url: resourceUrl, description: service.summary || listing.summary, amountAtomic: amount, payTo: getAddress(listing.payTo) });
  const client = robinhoodClient(e);
  const v = await verifyPayment(client, payment, required);
  if (!v.isValid) {
    if (v.retryable) return json(503, { error: "Could not reach Robinhood Chain to check the payment. Nothing was charged; retry.", reason: v.invalidReason, detail: v.detail }, { "retry-after": "2" });
    // invalid_amount on a quoted endpoint means the price moved: the new 402 carries it.
    return challenge(listing, service, amount, resourceUrl, v.invalidReason);
  }

  const sw = settlementWallet(e);
  if (!sw) return json(503, { error: "Settlement is not configured. Nothing was charged." });

  // Claim the nonce first: D1's unique index makes a replayed payment lose here,
  // before it can reach the upstream twice.
  const id = crypto.randomUUID();
  try {
    await d.insert(payments).values({
      id,
      listingId: listing.id,
      serviceId: service.id,
      payer: v.payer,
      payTo: getAddress(listing.payTo),
      amountAtomic: amount.toString(),
      nonce: payment.payload.authorization.nonce.toLowerCase(),
      status: "pending",
      requestPath: requestPath + incoming.search,
    });
  } catch {
    return challenge(listing, service, amount, resourceUrl, "authorization_already_used");
  }

  const started = Date.now();
  const finish = (patch: Partial<typeof payments.$inferInsert>) =>
    d.update(payments).set({ ...patch, latencyMs: Date.now() - started }).where(eq(payments.id, id));

  let upstream: Response;
  try {
    upstream = await forward(listing, req, requestPath, incoming.search, v.payer, body);
  } catch (err) {
    const msg = err instanceof UnsafeUrlError ? err.message : (err as Error).name === "TimeoutError" ? "upstream_timeout" : "upstream_unreachable";
    await finish({ status: "upstream_failed", error: msg });
    return json(502, { error: "The service did not answer. Nothing was charged.", detail: msg });
  }

  if (upstream.status < 200 || upstream.status >= 300) {
    await finish({ status: "upstream_failed", upstreamStatus: upstream.status, error: `upstream_${upstream.status}` });
    const text = await upstream.text().catch(() => "");
    return json(502, { error: "The service returned an error, so you were not charged.", upstreamStatus: upstream.status, upstreamBody: text.slice(0, 2000) });
  }
  const responseBody = await upstream.arrayBuffer();

  // Only now take the money.
  const settled: SettleResponse = await settlePayment(client, sw.wallet, sw.account, payment);
  if (!settled.success) {
    await finish({ status: "settle_failed", upstreamStatus: upstream.status, error: settled.errorReason, txHash: settled.transaction || null });
    return json(402, { error: "The payment could not be settled, so the response was withheld.", reason: settled.errorReason });
  }
  await finish({ status: "settled", upstreamStatus: upstream.status, txHash: settled.transaction });

  const out = new Headers();
  upstream.headers.forEach((val, key) => {
    if (!HOP.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie" && key.toLowerCase() !== "content-encoding") out.set(key, val);
  });
  const receipt = encodeHeader(settled);
  for (const h of HEADERS.response) out.set(h, receipt);
  out.set("access-control-allow-origin", "*");
  out.set("access-control-expose-headers", EXPOSE);
  out.set("x-x402fi-receipt", `/receipt/${id}`);
  return new Response(req.method === "HEAD" ? null : responseBody, { status: upstream.status, headers: out });
}

/**
 * A contract endpoint: priced by the contract's quote(label) and settled by calling it
 * with the buyer's authorization, so payment and delivery are one atomic transaction.
 * There is no upstream API. Enabled per listing by an x402Fi admin (x402Fi pays the gas).
 */
async function handleContract(
  req: Request,
  e: Awaited<ReturnType<typeof envAsync>>,
  d: ReturnType<typeof db>,
  listing: Listing,
  service: Service,
  requestPath: string,
  resourceUrl: string,
): Promise<Response> {
  const cfg = parseContractConfig(service.contractConfig);
  if (!cfg) return json(503, { error: "This endpoint is not configured." });
  const label = labelFromPath(service.path, requestPath);
  const prefix = `/g/${listing.slug}${service.path === "/" ? "" : service.path}`;
  if (!label) return json(400, { error: `Put the name in the URL: ${service.method} ${prefix}/<name>` });

  const client = robinhoodClient(e);
  const q = await quoteLabel(client, cfg.address, label);
  if (!q.ok) {
    if (q.unavailable) return json(409, { error: q.message, name: label + (cfg.labelSuffix ?? ""), status: q.status });
    return json(503, { error: "Could not price this name right now. Nothing was charged; retry.", detail: q.reason }, { "retry-after": "2" });
  }
  const amount = q.amountAtomic;
  if (service.maxPriceAtomic && amount > BigInt(service.maxPriceAtomic)) {
    return json(502, { error: "The quoted price is above this endpoint's published ceiling. Nothing was charged." });
  }

  const payment = readPayment(req);
  if (payment === null) return challenge(listing, service, amount, resourceUrl, undefined, cfg.address);
  if (payment === "malformed") return challenge(listing, service, amount, resourceUrl, "malformed_payment_header", cfg.address);

  if (listing.dailyCapAtomic) {
    const [{ total }] = await d
      .select({ total: sql<string>`coalesce(sum(cast(${payments.amountAtomic} as integer)), 0)` })
      .from(payments)
      .where(and(eq(payments.listingId, listing.id), eq(payments.status, "settled"), gte(payments.createdAt, startOfUtcDay())));
    if (BigInt(total) + amount > BigInt(listing.dailyCapAtomic)) {
      return json(429, { error: "This service has reached its daily limit. Try again tomorrow (UTC)." });
    }
  }

  const required = buildRequirements({ url: resourceUrl, description: service.summary || listing.summary, amountAtomic: amount, payTo: cfg.address });
  const v = await verifyPayment(client, payment, required);
  if (!v.isValid) {
    if (v.retryable) return json(503, { error: "Could not reach Robinhood Chain to check the payment. Nothing was charged; retry.", reason: v.invalidReason, detail: v.detail }, { "retry-after": "2" });
    return challenge(listing, service, amount, resourceUrl, v.invalidReason, cfg.address);
  }

  const sw = settlementWallet(e);
  if (!sw) return json(503, { error: "Settlement is not configured. Nothing was charged." });

  const id = crypto.randomUUID();
  try {
    await d.insert(payments).values({
      id,
      listingId: listing.id,
      serviceId: service.id,
      payer: v.payer,
      payTo: cfg.address,
      amountAtomic: amount.toString(),
      nonce: payment.payload.authorization.nonce.toLowerCase(),
      status: "pending",
      requestPath,
    });
  } catch {
    return challenge(listing, service, amount, resourceUrl, "authorization_already_used", cfg.address);
  }

  const started = Date.now();
  const settled = await settleViaContract(client, sw.wallet, sw.account, cfg.address, label, payment);
  const finish = (patch: Partial<typeof payments.$inferInsert>) =>
    d.update(payments).set({ ...patch, latencyMs: Date.now() - started }).where(eq(payments.id, id));
  if (!settled.success) {
    await finish({ status: "settle_failed", error: settled.errorReason, txHash: settled.transaction || null });
    // A simulation failure or a mined revert never moves money. Only a receipt timeout is
    // uncertain: then the transaction hash is returned so the buyer can check it.
    const uncertain = settled.errorReason === "receipt_timeout";
    return json(uncertain ? 504 : 402, {
      error: uncertain
        ? "The registration was submitted but not confirmed in time. Check the transaction before retrying."
        : "The registration could not be completed, so nothing was charged.",
      reason: settled.errorReason,
      transaction: settled.transaction || undefined,
    });
  }
  await finish({ status: "settled", txHash: settled.transaction });

  const receipt = encodeHeader(settled);
  const name = label + (cfg.labelSuffix ?? "");
  const headers: Record<string, string> = { "x-x402fi-receipt": `/receipt/${id}` };
  for (const h of HEADERS.response) headers[h] = receipt;
  return json(200, {
    registered: true,
    name,
    owner: v.payer,
    node: settled.node,
    pricePaid: amount.toString(),
    transaction: settled.transaction,
    explorer: txUrl(settled.transaction),
    receipt: `/receipt/${id}`,
  }, headers);
}
