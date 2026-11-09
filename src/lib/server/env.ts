import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

export interface AppEnv {
  DB: D1Database;
  KV: KVNamespace;
  /** Secret: settlement hot wallet. Holds ETH on 4663 for gas only. */
  SETTLEMENT_PRIVATE_KEY?: string;
  /** Secret: HMAC key for session cookies. */
  SESSION_SECRET?: string;
  /** Secret: keyed Robinhood Chain RPC, preferred over the public one. */
  ROBINHOOD_RPC_URL?: string;
  /** Secret: Ethereum mainnet RPC (Alchemy, server-only key) for ENS reads. */
  MAINNET_RPC_URL?: string;
}

/** Read bindings via OpenNext. Never `process.env` on Workers for bindings. */
export function env(): AppEnv {
  return getCloudflareContext().env as unknown as AppEnv;
}

export async function envAsync(): Promise<AppEnv> {
  return (await getCloudflareContext({ async: true })).env as unknown as AppEnv;
}

export function db(e: AppEnv = env()) {
  return drizzle(e.DB, { schema });
}
