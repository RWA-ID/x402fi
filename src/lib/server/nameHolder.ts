import "server-only";
import { BaseError, ContractFunctionRevertedError, getAddress, labelhash, namehash, parseAbi, zeroAddress, type Address } from "viem";
import { HOODFI_REGISTRY } from "@/lib/names";
import { mainnetClient, robinhoodClient } from "./clients";
import type { AppEnv } from "./env";

/**
 * Who holds a payee name, so a seller can only attach a name their signed-in wallet holds.
 *
 * Read per namespace, each VERIFIED on chain 2026-11-13:
 *  - *.hoodfi.eth: ERC-721 on Robinhood Chain (L2Registry), tokenId = namehash.
 *    A name that was never minted reverts ERC721NonexistentToken (0x7e273289).
 *  - x402 Identity (*.402api.eth etc.) and other wrapped names: NameWrapper.ownerOf(namehash);
 *    the ENS registry row says only "NameWrapper".
 *  - a second-level .eth: ask the ENSv2 ETH registry FIRST. A name moved to v2 keeps STALE
 *    v1 rows (crustacean.eth: v2 owner 0xAC50…, BaseRegistrar + registry still 0xDa02…),
 *    so v1 is consulted only for status 1 (= unmigrated v1).
 *  - v1 2LD: the BaseRegistrar registrant (reverts once expired) and the registry
 *    manager both count. A registry row outlives expiry, so it counts only while the
 *    registrant read succeeds.
 *
 * Not covered: subnames inside an ENSv2 subregistry (no v1 row) come back "none".
 */

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address;
const NAME_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401" as Address;
const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85" as Address;
const ETH_REGISTRY_V2 = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2" as Address;

const erc721 = parseAbi(["function ownerOf(uint256) view returns (address)"]);
const registry = parseAbi(["function owner(bytes32) view returns (address)"]);
const v2 = parseAbi([
  "function getStatus(uint256) view returns (uint8)",
  "function getTokenId(uint256) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
]);

export type NameHolders =
  /** Every address that controls the name (owner, and for v1 the manager). */
  | { state: "held"; holders: Address[] }
  /** Not registered, expired, or a kind of name we cannot read. */
  | { state: "none" }
  /** A read failed. Never treated as "not yours": a throttle is not a denial. */
  | { state: "unknown" };

/** A revert is an answer ("no such token"); anything else is a failed read. */
const reverted = (e: unknown) => e instanceof BaseError && !!e.walk((x) => x instanceof ContractFunctionRevertedError);

const real = (a: Address | null | undefined): a is Address => !!a && a !== zeroAddress;

export async function nameHolders(e: AppEnv, rawName: string): Promise<NameHolders> {
  const name = rawName.trim().toLowerCase();
  const node = namehash(name);
  try {
    if (name.endsWith(".hoodfi.eth")) {
      const o = await robinhoodClient(e)
        .readContract({ address: HOODFI_REGISTRY, abi: erc721, functionName: "ownerOf", args: [BigInt(node)] })
        .catch((err) => { if (reverted(err)) return null; throw err; });
      return real(o) ? { state: "held", holders: [getAddress(o)] } : { state: "none" };
    }

    const c = mainnetClient(e);
    const parts = name.split(".");
    if (parts.length === 2 && parts[1] === "eth") {
      const id = BigInt(labelhash(parts[0]!));
      const status = await c.readContract({ address: ETH_REGISTRY_V2, abi: v2, functionName: "getStatus", args: [id] });
      if (status === 2) {
        const tokenId = await c.readContract({ address: ETH_REGISTRY_V2, abi: v2, functionName: "getTokenId", args: [id] });
        const o = await c.readContract({ address: ETH_REGISTRY_V2, abi: v2, functionName: "ownerOf", args: [tokenId] });
        return real(o) ? { state: "held", holders: [getAddress(o)] } : { state: "none" };
      }
      if (status !== 1) return { state: "none" };
      const registrant = await c
        .readContract({ address: BASE_REGISTRAR, abi: erc721, functionName: "ownerOf", args: [id] })
        .catch((err) => { if (reverted(err)) return null; throw err; });
      if (!real(registrant)) return { state: "none" }; // expired
      if (registrant.toLowerCase() === NAME_WRAPPER.toLowerCase()) return wrappedHolder(e, node);
      const manager = await c.readContract({ address: ENS_REGISTRY, abi: registry, functionName: "owner", args: [node] });
      return { state: "held", holders: [...new Set([registrant, manager].filter(real).map((a) => getAddress(a)))] };
    }

    // Subnames (x402 Identity names are wrapped subnames) and DNS names.
    const o = await c.readContract({ address: ENS_REGISTRY, abi: registry, functionName: "owner", args: [node] });
    if (!real(o)) return { state: "none" };
    if (o.toLowerCase() === NAME_WRAPPER.toLowerCase()) return wrappedHolder(e, node);
    return { state: "held", holders: [getAddress(o)] };
  } catch (err) {
    console.error("nameHolders", name, err);
    return { state: "unknown" };
  }
}

/** NameWrapper.ownerOf answers zero for an expired wrapped name. */
async function wrappedHolder(e: AppEnv, node: `0x${string}`): Promise<NameHolders> {
  const o = await mainnetClient(e).readContract({ address: NAME_WRAPPER, abi: erc721, functionName: "ownerOf", args: [BigInt(node)] });
  return real(o) ? { state: "held", holders: [getAddress(o)] } : { state: "none" };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Gate for attaching a payee name to a listing: the signed-in seller's wallet must hold it.
 * Returns null when allowed, else the HTTP error to send.
 */
export async function sellerHoldsNameError(e: AppEnv, name: string, seller: Address): Promise<{ status: number; error: string } | null> {
  const h = await nameHolders(e, name);
  if (h.state === "unknown") return { status: 503, error: `Couldn't check who holds ${name} right now. Try again in a minute.` };
  if (h.state === "none") return { status: 422, error: `${name} isn't registered to anyone we can find on ENS or HoodFi Names. Check the spelling, or register it first.` };
  if (h.holders.some((a) => a.toLowerCase() === seller.toLowerCase())) return null;
  return {
    status: 403,
    error: `${name} is held by ${short(h.holders[0]!)}, not your signed-in wallet ${short(seller)}. Sign in with the wallet that holds the name to use it as your payee.`,
  };
}
