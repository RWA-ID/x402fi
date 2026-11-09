"use client";
import { useState } from "react";
import type { Connector } from "wagmi";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { mainnet } from "wagmi/chains";
import { getLowFees, payeeWrites, planPayeeRecords, publicResolverAbi, readPayeeRecords } from "@x402identity/widget-core";
import { NETWORK } from "@/lib/chains";

export type WritePayeeState = "idle" | "reading" | "signing" | "confirming" | "written" | "failed";

/** AppKit's embedded (email/social) wallet rejects an explicit chainId on writes. */
const writeChainId = (c: Connector | undefined) => (c?.id === "AUTH" || c?.type === "AUTH" ? undefined : mainnet.id);

/**
 * Writes the x402 payee-name records on an ENS name (Ethereum mainnet):
 * org.x402.origins gets the x402Fi origin added (existing origins are kept),
 * and the Robinhood Chain address record is set to the payout wallet.
 * Ported from x402-identity-hub's useWritePayee.
 */
export function useWritePayee() {
  const { chainId, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: mainnet.id });
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<WritePayeeState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  const write = async (name: string, origin: string, payTo: string) => {
    if (!client) return false;
    setError(null);
    setHash(null);
    setState("reading");
    try {
      const current = await readPayeeRecords(client as never, name, [NETWORK]);
      const origins = Array.from(new Set([...current.origins.split(/\s+/).filter(Boolean), origin]));
      const plan = planPayeeRecords(origins, [{ network: NETWORK, payTo }]);
      if (chainId !== mainnet.id) await switchChainAsync({ chainId: mainnet.id });
      const [writes, fees] = await Promise.all([payeeWrites(client as never, [{ name, plan }]), getLowFees(client as never)]);
      for (const w of writes) {
        setState("signing");
        const h = await writeContractAsync({ ...fees, chainId: writeChainId(connector), address: w.resolver, abi: publicResolverAbi, functionName: "multicall", args: [w.calls] });
        setHash(h);
        setState("confirming");
        // waitForTransactionReceipt resolves on a revert too: check the status.
        const receipt = await client.waitForTransactionReceipt({ hash: h });
        if (receipt.status !== "success") throw new Error("The transaction reverted. Is this wallet the name's owner or manager?");
      }
      setState("written");
      return true;
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage ?? err?.message ?? "Writing records failed");
      setState("failed");
      return false;
    }
  };

  return { write, state, error, hash, reset: () => { setState("idle"); setError(null); setHash(null); } };
}
