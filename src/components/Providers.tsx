"use client";
import { useState, type ReactNode } from "react";
import { WagmiProvider, type State } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { networks, projectId, wagmiAdapter, wagmiConfig } from "@/lib/client/wagmi";

// Module scope, no `typeof window` guard: useAppKit() runs during prerender and
// throws "Please call createAppKit before using useAppKit hook" without it.
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: networks[0],
  metadata: {
    name: "x402Fi",
    description: "Get paid by AI agents in USDG on Robinhood Chain.",
    url: typeof window !== "undefined" ? window.location.origin : "https://x402fi.dev",
    icons: [typeof window !== "undefined" ? `${window.location.origin}/icon-512.png` : "https://x402fi.dev/icon-512.png"],
  },
  features: { analytics: false },
  themeVariables: { "--w3m-accent": "#283a2a", "--w3m-border-radius-master": "2px" },
});

export function Providers({ children, initialState }: { children: ReactNode; initialState?: State }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
