"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { usePrimaryName } from "@/lib/client/usePrimaryName";

/**
 * Header wallet status. Shows the wallet's primary name and avatar (ENS or HoodFi),
 * falling back to the short address, and opens AppKit's account view; or a Connect
 * button. Renders after mount: the stored connection is only known client-side, and
 * rendering it during SSR would mismatch hydration.
 */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, chainId } = useAccount();
  const { open } = useAppKit();
  const { name, avatars } = usePrimaryName(address);
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
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <button
      onClick={() => open({ view: "Account" })}
      className={`inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-card ${name ? "font-medium" : "font-mono"} ${compact ? "max-w-[44vw]" : "max-w-[15rem]"}`}
      title={`${name ? `${name} · ` : ""}${address}${onRobinhood ? " · Robinhood Chain" : ""}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${onRobinhood ? "bg-good" : "bg-warn"}`} aria-hidden />
      {name && <Avatar key={avatars[0] ?? ""} sources={avatars} />}
      <span className="min-w-0 truncate">{name ?? short}</span>
    </button>
  );
}

/** Tries each source in turn; renders nothing once all have failed. */
function Avatar({ sources }: { sources: string[] }) {
  const [i, setI] = useState(0);
  const src = sources[i];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote avatar, any host
    <img src={src} alt="" width={20} height={20} className="h-5 w-5 shrink-0 rounded-full object-cover" onError={() => setI((n) => n + 1)} />
  );
}
