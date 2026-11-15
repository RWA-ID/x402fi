import "server-only";
import { sql } from "drizzle-orm";
import { listings } from "@/db/schema";
import { db, type AppEnv } from "./env";
import { dailySettleCap, RELEASE_SLOT_SQL, SLOTS_USED_SQL, TAKE_SLOT_SQL, utcDay } from "@/lib/x402/settleBudget";

/**
 * True when `payTo` is the payout wallet of a listing on x402Fi (live or paused; a native
 * listing counts). The public facilitator settles only to these, so every settlement it
 * pays gas for has an accountable seller behind it.
 */
export async function isListedPayee(e: AppEnv, payTo: string): Promise<boolean> {
  const rows = await db(e)
    .select({ id: listings.id })
    .from(listings)
    .where(sql`lower(${listings.payTo}) = ${payTo.toLowerCase()} and ${listings.status} in ('live', 'paused')`)
    .limit(1);
  return rows.length > 0;
}

/** True when the payee has used its settlements for today (what /verify answers before a seller does the work). */
export async function payeeAtDailyCap(e: AppEnv, payTo: string): Promise<boolean> {
  const row = await e.DB.prepare(SLOTS_USED_SQL).bind(payTo.toLowerCase(), utcDay()).first<{ count: number }>();
  return (row?.count ?? 0) >= dailySettleCap(e.FACILITATOR_DAILY_SETTLES);
}

/**
 * Takes one of the payee's settlements for today. Returns null at the cap, otherwise a
 * `release` to call when the settlement sent no transaction, so only gas spent is counted.
 */
export async function takeSettleSlot(e: AppEnv, payTo: string): Promise<{ release: () => Promise<void> } | null> {
  const key = payTo.toLowerCase();
  const day = utcDay();
  const res = await e.DB.prepare(TAKE_SLOT_SQL).bind(key, day, dailySettleCap(e.FACILITATOR_DAILY_SETTLES)).run();
  if (!((res.meta?.changes ?? 0) > 0)) return null;
  return { release: async () => { await e.DB.prepare(RELEASE_SLOT_SQL).bind(key, day).run().catch(() => {}); } };
}
