import { getAddress, isAddress, isAddressEqual } from "viem";
import { NETWORK, USDG } from "../chains";
import { decodeHeader } from "./encoding";
import { isBazaarExtension, type BazaarExtension } from "./bazaar";

/**
 * What x402Fi needs from a seller's own 402 to list a "native" endpoint: the USDG on
 * Robinhood Chain `exact` requirement (price and payTo) and, when the seller declares one,
 * its payee name. x402Fi never pays or proxies a native endpoint; buyers pay the seller.
 */
export interface NativeQuote {
  x402Version: 1 | 2;
  amount: string; // atomic USDG
  payTo: `0x${string}`;
  payeeName: string | null;
  description: string | null;
  /** Every network the seller offers, for display ("also accepts USDC on Base"). */
  networks: string[];
  /** The seller's own Bazaar declaration (extensions.bazaar), when its 402 has a valid one. */
  bazaar?: BazaarExtension | null;
}

export type NativeProbe = { ok: true; quote: NativeQuote } | { ok: false; reason: string };

/** Network names a 402 may use for Robinhood Chain: CAIP-2 (v2) or v1's short name. */
const ROBINHOOD_NAMES = new Set([NETWORK, "robinhood", "robinhood-chain"]);

type Accept = { scheme?: string; network?: string; amount?: string; maxAmountRequired?: string; payTo?: string; asset?: string; description?: string };

/**
 * Parses a seller's response to an unpaid request. Pure: takes the status, the
 * PAYMENT-REQUIRED header (if any) and the body text.
 */
export function parseNative402(status: number, paymentRequiredHeader: string | null, bodyText: string): NativeProbe {
  if (status !== 402) return { ok: false, reason: `expected HTTP 402 for an unpaid request, got ${status}` };
  let pr: { x402Version?: number; accepts?: Accept[]; resource?: { description?: string }; extensions?: Record<string, unknown> } | null = null;
  if (paymentRequiredHeader) {
    try { pr = decodeHeader(paymentRequiredHeader); } catch { /* fall back to the body */ }
  }
  if (!pr) {
    try { pr = JSON.parse(bodyText); } catch { return { ok: false, reason: "the 402 carries no readable payment requirements" }; }
  }
  if (!pr || !Array.isArray(pr.accepts) || pr.accepts.length === 0) return { ok: false, reason: "the 402 lists no payment options (accepts)" };
  const version = pr.x402Version === 1 ? 1 : 2;
  const networks = Array.from(new Set(pr.accepts.map((a) => String(a.network ?? "")).filter(Boolean)));
  const usdg = pr.accepts.find(
    (a) => a.scheme === "exact" && ROBINHOOD_NAMES.has(String(a.network)) && typeof a.asset === "string" && isAddress(a.asset) && isAddressEqual(a.asset as `0x${string}`, USDG.address),
  );
  if (!usdg) return { ok: false, reason: "no `exact` USDG payment on Robinhood Chain in the 402" };
  const amount = String(usdg.amount ?? usdg.maxAmountRequired ?? "");
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) return { ok: false, reason: "the USDG option has no valid amount" };
  if (typeof usdg.payTo !== "string" || !isAddress(usdg.payTo)) return { ok: false, reason: "the USDG option has no valid payTo" };
  const ext = pr.extensions?.["payee-name"] as { info?: { name?: unknown } } | undefined;
  const payeeName = typeof ext?.info?.name === "string" && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(ext.info.name) ? ext.info.name : null;
  const description = (usdg.description ?? pr.resource?.description ?? null)?.toString().slice(0, 300) ?? null;
  const bazaar = isBazaarExtension(pr.extensions?.bazaar) ? pr.extensions.bazaar : null;
  return { ok: true, quote: { x402Version: version, amount, payTo: getAddress(usdg.payTo), payeeName, description, networks, bazaar } };
}
