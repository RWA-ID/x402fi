import { defineChain } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;
export const NETWORK = `eip155:${ROBINHOOD_CHAIN_ID}` as const;

/**
 * Server-side only. In a browser this endpoint answers POST with a duplicated
 * `access-control-allow-origin: *,*` header, which the browser discards, so every
 * browser read goes through our own `/api/rpc` route instead (see BROWSER_RPC).
 */
export const ROBINHOOD_RPC_DIRECT = "https://rpc.mainnet.chain.robinhood.com";
export const BROWSER_RPC = "/api/rpc";
export const ROBINHOOD_EXPLORER = "https://robinhoodchain.blockscout.com";

export const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC_DIRECT] } },
  blockExplorers: { default: { name: "Blockscout", url: ROBINHOOD_EXPLORER } },
});

/** USDG (Global Dollar, Paxos) on Robinhood Chain. Supports EIP-3009. */
export const USDG = {
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  decimals: 6,
  symbol: "USDG",
  /**
   * EIP-712 domain. The token has no version() getter; "1" was confirmed by
   * reproducing DOMAIN_SEPARATOR() (0x7a3d…2036) on 2026-11-08.
   */
  eip712: { name: "Global Dollar", version: "1" },
} as const;

/** ENSIP-11 coin type for Robinhood Chain: 0x80000000 | 4663. */
export const ROBINHOOD_COIN_TYPE = 2147488311n;

export const txUrl = (hash: string) => `${ROBINHOOD_EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${ROBINHOOD_EXPLORER}/address/${a}`;
