"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";

/** Wallet sign-in (SIWE). `seller` is the signed-in address according to the server. */
export function useSession() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [seller, setSeller] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/auth/me").then((r) => r.json() as Promise<{ address: string | null }>).catch(() => ({ address: null }));
    setSeller(r.address ?? null);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const signIn = async () => {
    if (!address) return;
    setBusy(true); setError(null);
    try {
      const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };
      const message = createSiweMessage({
        address, chainId: chainId ?? 1, domain: window.location.host, nonce, uri: window.location.origin, version: "1",
        statement: "Sign in to x402Fi. This does not cost anything or move funds.",
      });
      const signature = await signMessageAsync({ message });
      const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const j = (await r.json()) as { error?: string; address: string };
      if (!r.ok) throw new Error(j.error ?? "Sign-in failed");
      setSeller(j.address);
    } catch (e) {
      setError((e as { shortMessage?: string; message: string }).shortMessage ?? (e as Error).message.split("\n")[0]);
    } finally { setBusy(false); }
  };
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); setSeller(null); };
  const mismatch = !!seller && !!address && seller.toLowerCase() !== address.toLowerCase();
  return { seller, signIn, signOut, busy, error, mismatch };
}
