"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { encodeFunctionData, getAddress, namehash, parseAbi, type Hex } from "viem";
import { buildPayeeCalls, planPayeeRecords, textResolverAbi } from "@x402identity/widget-core";
import { NETWORK, ROBINHOOD_CHAIN_ID } from "@/lib/chains";
import type { ProfileRecords, WritePayeeState } from "./useWritePayee";

import { HOODFI_REGISTRY } from "@/lib/names";
export { HOODFI_REGISTRY };

const registryAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
  "function multicall(bytes[] data) returns (bytes[])",
]);

const splitList = (s: string) => s.split(/\s+/).filter(Boolean);

/** "dominic" or "dominic.hoodfi.eth" → "dominic.hoodfi.eth"; null if it is not one label. */
export function hoodfiName(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\.hoodfi\.eth$/, "");
  return /^[a-z0-9-]{1,63}$/.test(s) ? `${s}.hoodfi.eth` : null;
}

/**
 * Writes the x402 payee-name records on a HoodFi name, in ONE Robinhood Chain transaction
 * to the L2Registry: org.x402.origins (merged), the Robinhood Chain address = payTo,
 * org.x402.payto (merged, never erased) and optional profile records. Gas is ETH on 4663.
 */
export function useWriteHoodfiPayee() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: ROBINHOOD_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<WritePayeeState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  const write = async (name: string, origin: string, payTo: string, profile: ProfileRecords = {}) => {
    if (!client || !address) return false;
    setError(null);
    setHash(null);
    setState("reading");
    try {
      const node = namehash(name);
      const tokenId = BigInt(node);
      const [owner, approved, origins, payto] = await Promise.all([
        client.readContract({ address: HOODFI_REGISTRY, abi: registryAbi, functionName: "ownerOf", args: [tokenId] }).catch(() => null),
        client.readContract({ address: HOODFI_REGISTRY, abi: registryAbi, functionName: "getApproved", args: [tokenId] }).catch(() => null),
        client.readContract({ address: HOODFI_REGISTRY, abi: registryAbi, functionName: "text", args: [node, "org.x402.origins"] }),
        client.readContract({ address: HOODFI_REGISTRY, abi: registryAbi, functionName: "text", args: [node, "org.x402.payto"] }),
      ]);
      if (!owner) throw new Error(`${name} is not registered yet.`);
      const me = getAddress(address);
      if (getAddress(owner) !== me && (!approved || getAddress(approved) !== me)) {
        throw new Error(`This wallet does not own ${name}. Connect the wallet that holds it.`);
      }

      const plan = planPayeeRecords(Array.from(new Set([...splitList(origins), origin])), [{ network: NETWORK, payTo }]);
      plan.payto = Array.from(new Set([...splitList(payto), ...plan.payto]));
      const calls: Hex[] = [...buildPayeeCalls(node, plan)];
      for (const [key, value] of Object.entries({ avatar: profile.avatar, url: profile.url, "com.twitter": profile.twitter })) {
        if (typeof value === "string" && value.trim()) {
          calls.push(encodeFunctionData({ abi: textResolverAbi, functionName: "setText", args: [node, key, value.trim()] } as never));
        }
      }

      if (chainId !== ROBINHOOD_CHAIN_ID) await switchChainAsync({ chainId: ROBINHOOD_CHAIN_ID });
      setState("signing");
      const h = await writeContractAsync({ chainId: ROBINHOOD_CHAIN_ID, address: HOODFI_REGISTRY, abi: registryAbi, functionName: "multicall", args: [calls] });
      setHash(h);
      setState("confirming");
      const receipt = await client.waitForTransactionReceipt({ hash: h });
      if (receipt.status !== "success") throw new Error("The transaction reverted. Is this wallet the name's owner?");
      setState("written");
      return true;
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage ?? err?.message ?? "Writing records failed");
      setState("failed");
      return false;
    }
  };

  return { write, state, error, hash };
}
