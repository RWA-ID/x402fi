import "server-only";
import { sql } from "drizzle-orm";
import { listings } from "@/db/schema";
import { db, type AppEnv } from "./env";

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
