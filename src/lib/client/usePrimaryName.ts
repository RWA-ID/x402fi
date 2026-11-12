"use client";
import { useEnsAvatar, useEnsName, useEnsText } from "wagmi";
import { mainnet } from "wagmi/chains";

/** Our Pinata gateway serves what we pinned (HoodFi avatar uploads) at once; it 403s anything else. */
const PINNED_GATEWAY = "https://ipfs.onchain-id.id/ipfs/";
const PUBLIC_GATEWAY = "https://ipfs.io/ipfs/";

/**
 * A wallet's ENS primary name and avatar candidates, best first.
 *
 * Read on Ethereum mainnet through the Universal Resolver, which follows CCIP, so a
 * HoodFi name set as the wallet's primary resolves the same way a plain .eth does. The
 * resolver also checks the name points back at the wallet, so a reverse record set
 * without owning the name never shows.
 *
 * Undefined while loading, on a failed read, or with no primary: the caller shows the
 * address, which is always true.
 */
export function usePrimaryName(address: `0x${string}` | undefined): { name?: string; avatars: string[] } {
  const { data: name } = useEnsName({
    address,
    chainId: mainnet.id,
    query: { enabled: !!address, staleTime: 5 * 60_000 },
  });
  const { data: record } = useEnsText({
    name: name ?? undefined,
    key: "avatar",
    chainId: mainnet.id,
    query: { enabled: !!name, staleTime: 5 * 60_000 },
  });
  // An NFT avatar (eip155:…) is not a URL; wagmi resolves it through the token's metadata.
  const isNft = !!record?.startsWith("eip155:");
  const { data: nftImage } = useEnsAvatar({
    name: name ?? undefined,
    chainId: mainnet.id,
    query: { enabled: !!name && isNft, staleTime: 5 * 60_000 },
  });
  return { name: name ?? undefined, avatars: avatarUrls(isNft ? nftImage ?? "" : record ?? "") };
}

function avatarUrls(value: string): string[] {
  const ipfs = /^ipfs:\/\/(?:ipfs\/)?(.+)$/.exec(value);
  if (ipfs) return [`${PINNED_GATEWAY}${ipfs[1]}?img-width=64&img-height=64&img-fit=cover`, `${PUBLIC_GATEWAY}${ipfs[1]}`];
  return /^(https:|data:image\/)/.test(value) ? [value] : [];
}
