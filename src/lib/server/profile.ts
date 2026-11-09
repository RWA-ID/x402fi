import "server-only";
import { normalize } from "viem/ens";
import { mergeProfile, type Profile } from "@/lib/profile";
import { mainnetClient } from "./clients";
import { envAsync } from "./env";

type EnsProfile = { avatar: string | null; url: string | null; twitter: string | null };

const TTL = 600;

/**
 * Profile records of a payee name. A failed read returns null (and is cached
 * briefly), so the page falls back to seller-entered fields instead of showing
 * an outage as "no profile".
 */
async function ensProfile(name: string): Promise<EnsProfile | null> {
  const e = await envAsync();
  const key = `profile:${name}`;
  const hit = await e.KV.get(key, "json").catch(() => null);
  if (hit) return (hit as { v: EnsProfile | null }).v;
  let v: EnsProfile | null;
  try {
    const client = mainnetClient(e);
    const n = normalize(name);
    // The raw avatar record is kept; parseLogo turns ipfs:// into a gateway URL.
    // NFT avatars (eip155:…) are not resolved here and simply don't show.
    // Standard ENSIP-5 keys first (url, com.twitter); non-standard aliases that
    // record editors write as fallbacks. Keys are case-sensitive: the x402 Identity
    // Hub's editor wrote "X" (a full x.com URL) and "website" on hoodfi.402api.eth.
    const keys = ["avatar", "url", "website", "Website", "com.twitter", "com.x", "X", "x", "twitter"] as const;
    const vals = await Promise.all(keys.map((k) => client.getEnsText({ name: n, key: k })));
    const r = Object.fromEntries(keys.map((k, i) => [k, vals[i] || null])) as Record<(typeof keys)[number], string | null>;
    v = {
      avatar: r.avatar,
      url: r.url ?? r.website ?? r.Website,
      twitter: r["com.twitter"] ?? r["com.x"] ?? r.X ?? r.x ?? r.twitter,
    };
  } catch (err) {
    console.error("ensProfile", name, err);
    v = null;
  }
  await e.KV.put(key, JSON.stringify({ v }), { expirationTtl: v ? TTL : 60 }).catch(() => {});
  return v;
}

export async function listingProfile(l: { identityName: string | null; logoUrl: string | null; websiteUrl: string | null; xHandle: string | null }): Promise<Profile> {
  const ens = l.identityName ? await ensProfile(l.identityName) : null;
  return mergeProfile(ens, l);
}
