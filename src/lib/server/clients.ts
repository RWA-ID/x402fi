import "server-only";
import { createPublicClient, createWalletClient, fallback, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood, ROBINHOOD_RPC_DIRECT } from "@/lib/chains";
import type { AppEnv } from "./env";

/** Blockscout's RPC: a last resort for reads (it does not take transactions). */
const ROBINHOOD_RPC_BLOCKSCOUT = "https://robinhoodchain.blockscout.com/api/eth-rpc";
const PUBLIC_MAINNET_RPC = "https://ethereum-rpc.publicnode.com";

/**
 * Robinhood Chain reads.
 *
 * The public RPC rate-limits per IP, and all Cloudflare Workers egress from a small
 * shared pool: on 2026-11-08 the facilitator failed 5 of 6 verifications against it
 * from the Worker while every call from a laptop passed (HoodFi measured 2/12 vs 15/15).
 * The dedicated ROBINHOOD_RPC_URL (Alchemy) is the fix; the public endpoints stay
 * behind it so a missing or expired key degrades instead of failing outright.
 * Ranking is off: background probes would spend the rate limit we are protecting.
 */
export function robinhoodClient(e: AppEnv): PublicClient {
  const urls = [e.ROBINHOOD_RPC_URL, ROBINHOOD_RPC_DIRECT, ROBINHOOD_RPC_BLOCKSCOUT].filter(Boolean) as string[];
  return createPublicClient({
    chain: robinhood,
    transport: fallback(urls.map((u) => http(u, { retryCount: 2, retryDelay: 200, timeout: 8_000 })), { rank: false }),
  }) as PublicClient;
}

export function mainnetClient(e: AppEnv): PublicClient {
  const urls = [e.MAINNET_RPC_URL, PUBLIC_MAINNET_RPC].filter(Boolean) as string[];
  return createPublicClient({
    chain: mainnet,
    transport: fallback(urls.map((u) => http(u, { retryCount: 2, retryDelay: 200, timeout: 8_000 })), { rank: false }),
  }) as PublicClient;
}

/** Settlement sends: the dedicated RPC first, the chain's own as backup (never Blockscout). */
export function settlementWallet(e: AppEnv) {
  if (!e.SETTLEMENT_PRIVATE_KEY) return null;
  const account = privateKeyToAccount(e.SETTLEMENT_PRIVATE_KEY as `0x${string}`);
  const urls = [e.ROBINHOOD_RPC_URL, ROBINHOOD_RPC_DIRECT].filter(Boolean) as string[];
  const wallet = createWalletClient({
    account,
    chain: robinhood,
    transport: fallback(urls.map((u) => http(u, { retryCount: 1, timeout: 15_000 })), { rank: false }),
  });
  return { account, wallet };
}
