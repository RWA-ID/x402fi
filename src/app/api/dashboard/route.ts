import { desc, eq, inArray, sql } from "drizzle-orm";
import { listings, payments, services } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { currentSeller } from "@/lib/server/session";

export async function GET() {
  const seller = await currentSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  const d = db(await envAsync());
  const mine = await d.select().from(listings).where(eq(listings.seller, seller)).orderBy(desc(listings.createdAt));
  const ids = mine.map((l) => l.id);
  if (!ids.length) return Response.json({ listings: [], payments: [], daily: [], serviceNames: {}, totals: { revenueAtomic: "0", calls: 0, failed: 0 } });

  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const [recent, daily, totals, perListing] = await Promise.all([
    d.select().from(payments).where(inArray(payments.listingId, ids)).orderBy(desc(payments.createdAt)).limit(100),
    d
      .select({
        day: sql<string>`strftime('%Y-%m-%d', ${payments.createdAt}, 'unixepoch')`,
        revenue: sql<number>`sum(case when ${payments.status} = 'settled' then cast(${payments.amountAtomic} as integer) else 0 end)`,
        calls: sql<number>`sum(case when ${payments.status} = 'settled' then 1 else 0 end)`,
      })
      .from(payments)
      .where(sql`${inArray(payments.listingId, ids)} and ${payments.createdAt} >= ${since}`)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    d
      .select({
        revenue: sql<number>`coalesce(sum(case when ${payments.status} = 'settled' then cast(${payments.amountAtomic} as integer) else 0 end), 0)`,
        calls: sql<number>`coalesce(sum(case when ${payments.status} = 'settled' then 1 else 0 end), 0)`,
        failed: sql<number>`coalesce(sum(case when ${payments.status} in ('settle_failed','upstream_failed') then 1 else 0 end), 0)`,
      })
      .from(payments)
      .where(inArray(payments.listingId, ids)),
    d
      .select({ id: payments.listingId, revenue: sql<number>`coalesce(sum(cast(${payments.amountAtomic} as integer)), 0)`, calls: sql<number>`count(*)` })
      .from(payments)
      .where(sql`${inArray(payments.listingId, ids)} and ${payments.status} = 'settled'`)
      .groupBy(payments.listingId),
  ]);
  const per = new Map(perListing.map((p) => [p.id, p]));
  const svc = await d.select({ id: services.id, name: services.name }).from(services).where(inArray(services.listingId, ids));
  return Response.json({
    serviceNames: Object.fromEntries(svc.map((s) => [s.id, s.name])),
    listings: mine.map(({ upstreamSecret: _s, ...l }) => ({ ...l, revenueAtomic: String(per.get(l.id)?.revenue ?? 0), calls: per.get(l.id)?.calls ?? 0 })),
    payments: recent,
    daily: daily.map((r) => ({ day: r.day, revenueAtomic: String(r.revenue ?? 0), calls: r.calls ?? 0 })),
    totals: { revenueAtomic: String(totals[0]?.revenue ?? 0), calls: totals[0]?.calls ?? 0, failed: totals[0]?.failed ?? 0 },
  });
}
