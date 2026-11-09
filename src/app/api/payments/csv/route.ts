import { desc, eq, inArray } from "drizzle-orm";
import { listings, payments, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { currentSeller } from "@/lib/server/session";
import { atomicToUsd } from "@/lib/x402/money";
import { txUrl } from "@/lib/chains";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const seller = await currentSeller();
  if (!seller) return new Response("Sign in first.", { status: 401 });
  const d = db(await envAsync());
  const mine = await d.select({ id: listings.id, name: listings.name, slug: listings.slug }).from(listings).where(eq(listings.seller, seller));
  const byId = new Map(mine.map((l) => [l.id, l]));
  const rows = mine.length
    ? await d.select().from(payments).where(inArray(payments.listingId, [...byId.keys()])).orderBy(desc(payments.createdAt)).limit(50_000)
    : [];
  const svcNames = new Map(
    mine.length ? (await d.select({ id: services.id, name: services.name }).from(services).where(inArray(services.listingId, [...byId.keys()]))).map((x) => [x.id, x.name]) : [],
  );
  const origin = new URL(req.url).origin;
  const header = ["date_utc", "service", "endpoint", "status", "amount_usdg", "payer", "pay_to", "network", "tx_hash", "explorer", "receipt", "request_path", "upstream_status", "error"];
  const lines = rows.map((p) =>
    [
      new Date(p.createdAt * 1000).toISOString(),
      byId.get(p.listingId)?.name,
      p.serviceId ? svcNames.get(p.serviceId) : "",
      p.status,
      atomicToUsd(p.amountAtomic),
      p.payer,
      p.payTo,
      "eip155:4663",
      p.txHash,
      p.txHash ? txUrl(p.txHash) : "",
      `${origin}/receipt/${p.id}`,
      p.requestPath,
      p.upstreamStatus,
      p.error,
    ].map(cell).join(","),
  );
  return new Response([header.join(","), ...lines].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="x402fi-payments-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
