import "server-only";
import { payeeStatus } from "./payee";
import { nativeBaseUrl, type PublicListing } from "./queries";

/** A card shows "Verified payee" only when this is true; otherwise "Named payee". */
export type CardListing = PublicListing & { payeeVerified?: boolean };

const CONCURRENCY = 4;
/** Per check. A slow or throttled read falls back to "Named payee"; it does not hold the page. */
const TIMEOUT_MS = 2500;

/**
 * The listing page's payee check (same verifier, same 10-minute KV cache), as a yes/no.
 * Buyers of an all-native listing contact the seller's origin, so that is what the name must list.
 * `timeoutMs`: a slow or throttled read answers false ("Named payee") instead of waiting.
 */
export async function listingPayeeVerified(l: PublicListing, origin: string, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  if (!l.identityName) return false;
  try {
    const live = l.services.filter((s) => s.status === "live");
    const base = await nativeBaseUrl(l);
    const allNative = !!base && live.length > 0 && live.every((s) => s.pricing === "native");
    const check = payeeStatus({ identityName: l.identityName, payTo: l.payTo, origin: allNative ? new URL(base!).origin : origin, slug: l.slug });
    const s = await Promise.race([check, new Promise<null>((res) => setTimeout(() => res(null), timeoutMs))]);
    return s?.state === "verified";
  } catch {
    return false;
  }
}

/**
 * Runs the listing page's payee check for every named listing, so cards can say
 * "Verified payee" honestly. Same verifier and the same 10-minute KV cache as the
 * listing page, so a warm cache costs one KV read per name. Cold reads are capped
 * at CONCURRENCY at a time: Workers share egress IPs and public RPCs throttle them.
 */
export async function withPayeeBadges(rows: PublicListing[], origin: string): Promise<CardListing[]> {
  const out: CardListing[] = rows.map((r) => ({ ...r }));
  const todo = out.filter((r) => r.identityName);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const l = todo[next++]!;
      l.payeeVerified = await listingPayeeVerified(l, origin);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return out;
}
