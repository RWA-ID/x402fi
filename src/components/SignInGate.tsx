"use client";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useSession } from "@/lib/client/useSession";

/** Renders children once a wallet is connected and signed in. */
export function SignInGate({ children, why }: { children: (seller: string) => ReactNode; why: string }) {
  const { isConnected } = useAccount();
  const { open } = useAppKit();
  const s = useSession();
  if (s.seller === undefined) return <div className="card p-8 text-ink-3">Loading…</div>;
  if (s.seller && !s.mismatch) return <>{children(s.seller)}</>;
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h2 className="display text-4xl">Sign in with your wallet</h2>
      <p className="mt-3 text-ink-2">{why}</p>
      <p className="mt-2 text-sm text-ink-3">Signing a message is free and moves no funds. Email and social login work too.</p>
      {s.mismatch && <p className="mt-3 text-sm text-warn">Your wallet changed. Sign in again with the connected wallet.</p>}
      <div className="mt-6">
        {isConnected ? (
          <button onClick={s.signIn} disabled={s.busy} className="btn btn-primary">{s.busy ? "Check your wallet…" : "Sign in"}</button>
        ) : (
          <button onClick={() => open()} className="btn btn-primary">Connect wallet</button>
        )}
      </div>
      {s.error && <p className="mt-3 text-sm text-bad">{s.error}</p>}
    </div>
  );
}
