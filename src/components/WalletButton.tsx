"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";

/**
 * Header wallet status. Shows the connected address (opens AppKit's account view),
 * or a Connect button. Renders after mount: the stored connection is only known
 * client-side, and rendering it during SSR would mismatch hydration.
 */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, chainId } = useAccount();
  const { open } = useAppKit();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <span className={compact ? "h-9 w-9" : "h-9 w-[7.5rem]"} aria-hidden />;
  if (!isConnected || !address) {
    return (
      <button onClick={() => open()} className="btn btn-ghost py-2 text-sm">
        {compact ? "Connect" : "Connect wallet"}
      </button>
    );
  }
  const onRobinhood = chainId === 4663;
  return (
    <button
      onClick={() => open({ view: "Account" })}
      className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 font-mono text-sm hover:bg-card"
      title={`${address}${onRobinhood ? " · Robinhood Chain" : ""}`}
    >
      <span className={`h-2 w-2 rounded-full ${onRobinhood ? "bg-good" : "bg-warn"}`} aria-hidden />
      {address.slice(0, 6)}…{address.slice(-4)}
    </button>
  );
}
