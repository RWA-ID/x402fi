import { USDG } from "../chains";

/**
 * Lowest price a paid call may have: $0.01 (10,000 atomic USDG).
 * Settling one payment costs x402Fi ~$0.006-0.007 of gas on Robinhood Chain
 * (measured on the first live payment, 2026-11-08), so a cent covers it.
 */
export const MIN_PRICE_ATOMIC = 10_000n;
export const MIN_PRICE_LABEL = "$0.01";

/** "$0.001" | "0.001" → atomic USDG units (6 decimals). Rejects anything else. */
export function usdToAtomic(input: string): bigint {
  const s = input.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Price must be a number, like 0.01");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > USDG.decimals) throw new Error(`Price can have at most ${USDG.decimals} decimals`);
  return BigInt(whole) * 10n ** BigInt(USDG.decimals) + BigInt(frac.padEnd(USDG.decimals, "0"));
}

export function atomicToUsd(atomic: bigint | string): string {
  const v = BigInt(atomic);
  const d = 10n ** BigInt(USDG.decimals);
  const frac = (v % d).toString().padStart(USDG.decimals, "0").replace(/0+$/, "");
  return `${v / d}${frac ? "." + frac : ""}`;
}

/** Human display: $0.001, $12.50 */
export function formatUsd(atomic: bigint | string): string {
  const s = atomicToUsd(atomic);
  const [w, f = ""] = s.split(".");
  return `$${Number(w).toLocaleString("en-US")}.${f.length < 2 ? f.padEnd(2, "0") : f}`;
}
