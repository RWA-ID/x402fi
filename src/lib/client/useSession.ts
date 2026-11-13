"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";

/** Fired after the session ends, so every useSession on the page drops its seller. */
export const SIGNED_OUT_EVENT = "x402fi:signed-out";

/** Wallet sign-in (SIWE). `seller` is the signed-in address according to the server. */
export function useSession() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();
  const [seller, setSeller] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/auth/me").then((r) => r.json() as Promise<{ address: string | null }>).catch(() => ({ address: null }));
    setSeller(r.address ?? null);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const off = () => setSeller(null);
    window.addEventListener(SIGNED_OUT_EVENT, off);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, off);
  }, []);

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
  // One sign-out: ends the session AND disconnects the wallet (which SessionSync would also catch).
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSeller(null);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    await disconnectAsync().catch(() => {});
  };
  const mismatch = !!seller && !!address && seller.toLowerCase() !== address.toLowerCase();
  return { seller, signIn, signOut, busy, error, mismatch };
}
