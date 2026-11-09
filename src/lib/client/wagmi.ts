"use client";
import { cookieStorage, createStorage, http } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, mainnet } from "@reown/appkit/networks";
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_EXPLORER, ROBINHOOD_RPC_DIRECT } from "@/lib/chains";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "43bdd1b8c477ac4d4a4264a14a8472f8";

const origin = typeof window !== "undefined" ? window.location.origin : "";
/** Browser RPC goes through our Worker: the chain's endpoint sends a broken CORS header. */
const robinhoodRpc = origin ? `${origin}/api/rpc` : ROBINHOOD_RPC_DIRECT;
const mainnetRpc = origin ? `${origin}/api/rpc/mainnet` : "https://eth.llamarpc.com";

export const robinhoodNetwork = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  caipNetworkId: `eip155:${ROBINHOOD_CHAIN_ID}`,
  chainNamespace: "eip155",
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [robinhoodRpc] } },
  blockExplorers: { default: { name: "Blockscout", url: ROBINHOOD_EXPLORER } },
});

export const networks = [robinhoodNetwork, mainnet] as [typeof robinhoodNetwork, typeof mainnet];

export const wagmiAdapter = new WagmiAdapter({
  // ssr: true defers stored connection state to after mount (avoids React #418).
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  projectId,
  networks,
  transports: { [ROBINHOOD_CHAIN_ID]: http(robinhoodRpc), [mainnet.id]: http(mainnetRpc) },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
