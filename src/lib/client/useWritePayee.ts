"use client";
import { useState } from "react";
import type { Connector } from "wagmi";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { mainnet } from "wagmi/chains";
import { encodeFunctionData, namehash, type Hex } from "viem";
import {
  dnsEncode,
  ensVersion,
  getLowFees,
  payeeWrites,
  permissionedResolverAbi,
  planPayeeRecords,
  publicResolverAbi,
  readPayeeRecords,
  textResolverAbi,
} from "@x402identity/widget-core";
import { NETWORK } from "@/lib/chains";

export type WritePayeeState = "idle" | "reading" | "signing" | "confirming" | "written" | "failed";

/** Optional public profile records, written with the standard ENSIP-5 keys. */
export interface ProfileRecords {
  avatar?: string; // https:// or ipfs:// image
  url?: string; // https:// website
  twitter?: string; // X handle without "@"
}

/** AppKit's embedded (email/social) wallet rejects an explicit chainId on writes. */
const writeChainId = (c: Connector | undefined) => (c?.id === "AUTH" || c?.type === "AUTH" ? undefined : mainnet.id);

const splitList = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Writes the x402 payee-name records on an ENS name (Ethereum mainnet), in ONE transaction:
 *  - org.x402.origins: the x402Fi origin is added, existing origins are kept;
 *  - the Robinhood Chain address record = the payout wallet;
 *  - org.x402.payto: existing entries are KEPT (widget-core's builder always rewrites this
 *    key, so without the merge a re-run would erase e.g. a contract payee added by hand);
 *  - optionally avatar, url and com.twitter.
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

  const write = async (name: string, origin: string, payTo: string, profile: ProfileRecords = {}) => {
    if (!client) return false;
    setError(null);
    setHash(null);
    setState("reading");
    try {
      const c = client as never;
      const [current, version] = await Promise.all([readPayeeRecords(c, name, [NETWORK]), ensVersion(c, name)]);
      const origins = Array.from(new Set([...splitList(current.origins), origin]));
      const plan = planPayeeRecords(origins, [{ network: NETWORK, payTo }]);
      plan.payto = Array.from(new Set([...splitList(current.payto), ...plan.payto]));

      const texts = Object.entries({ avatar: profile.avatar, url: profile.url, "com.twitter": profile.twitter })
        .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "")
        .map(([key, value]) =>
          version === "v2"
            ? encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [dnsEncode(name), key, value.trim()] } as never)
            : encodeFunctionData({ abi: textResolverAbi, functionName: "setText", args: [namehash(name), key, value.trim()] } as never),
        ) as Hex[];

      if (chainId !== mainnet.id) await switchChainAsync({ chainId: mainnet.id });
      const [writes, fees] = await Promise.all([payeeWrites(c, [{ name, plan }]), getLowFees(c)]);
      // One name → one resolver → one multicall; the profile calls ride along in it.
      if (writes.length === 1) writes[0].calls.push(...texts);
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
