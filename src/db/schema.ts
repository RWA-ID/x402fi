import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

const now = () => Math.floor(Date.now() / 1000);

/** A seller is a wallet that signed in with SIWE. */
export const sellers = sqliteTable("sellers", {
  address: text("address").primaryKey(), // checksummed
  orgName: text("org_name"),
  contactEmail: text("contact_email"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
});

export const listings = sqliteTable(
  "listings",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    seller: text("seller").notNull().references(() => sellers.address),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    /** Where paid calls are forwarded. https only, checked by the SSRF guard. */
    upstreamUrl: text("upstream_url").notNull(),
    method: text("method").notNull().default("GET"),
    priceAtomic: text("price_atomic").notNull(), // USDG, 6 decimals, as string
    payTo: text("pay_to").notNull(),
    /** x402 Identity name, e.g. acme.402api.eth. Null until registered. */
    identityName: text("identity_name"),
    /** Sent upstream as X-X402Fi-Secret so the seller can reject direct calls. */
    upstreamSecret: text("upstream_secret").notNull(),
    dailyCapAtomic: text("daily_cap_atomic"),
    exampleRequest: text("example_request"),
    exampleResponse: text("example_response"),
    status: text("status", { enum: ["draft", "live", "paused"] }).notNull().default("draft"),
    /**
     * Seller-entered profile, shown as "provided by the seller". Records on the
     * payee name (avatar, url, com.twitter) take precedence and show as verified.
     */
    logoUrl: text("logo_url"),
    websiteUrl: text("website_url"),
    xHandle: text("x_handle"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("listings_seller_idx").on(t.seller), index("listings_status_idx").on(t.status)],
);

/**
 * An endpoint inside a listing. A listing is a project (one payout wallet, one
 * payee name, one upstream base URL); each service is a path under it with its
 * own method and pricing.
 *
 * Pricing:
 *  - free:   forwarded without payment.
 *  - fixed:  priceAtomic per call.
 *  - quote:  the seller's API names the price per request at
 *            upstream + quotePath + (path after the service prefix), capped by maxPriceAtomic.
 *  - contract: an on-chain "label registrar" (e.g. HoodfiX402Registrar) prices the request
 *            with quote(label) and is settled by calling registerWithAuthorization(label, auth)
 *            instead of a plain USDG transfer. Admin-enabled only: x402Fi pays that gas.
 */
export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull().references(() => listings.id),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    method: text("method").notNull().default("GET"),
    /** Path prefix under the listing, e.g. "/register". "/" matches everything. */
    path: text("path").notNull().default("/"),
    pricing: text("pricing", { enum: ["free", "fixed", "quote", "contract"] }).notNull().default("fixed"),
    priceAtomic: text("price_atomic"),
    quotePath: text("quote_path"),
    maxPriceAtomic: text("max_price_atomic"),
    /** For pricing "contract": JSON { address, kind: "label-registrar", labelSuffix? }. */
    contractConfig: text("contract_config"),
    exampleRequest: text("example_request"),
    exampleResponse: text("example_response"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status", { enum: ["live", "paused"] }).notNull().default("live"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("services_listing_idx").on(t.listingId, t.sortOrder)],
);

/** The ledger. One row per paid attempt, whatever its outcome. */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull().references(() => listings.id),
    /** Null for payments made before services existed. */
    serviceId: text("service_id").references(() => services.id),
    payer: text("payer").notNull(),
    payTo: text("pay_to").notNull(),
    amountAtomic: text("amount_atomic").notNull(),
    nonce: text("nonce").notNull().unique(),
    status: text("status", { enum: ["pending", "settled", "settle_failed", "upstream_failed"] }).notNull(),
    txHash: text("tx_hash"),
    error: text("error"),
    requestPath: text("request_path").notNull(),
    upstreamStatus: integer("upstream_status"),
    latencyMs: integer("latency_ms"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("payments_listing_idx").on(t.listingId, t.createdAt), index("payments_payto_idx").on(t.payTo, t.createdAt)],
);

export type Listing = typeof listings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Service = typeof services.$inferSelect;
