import "server-only";
import { getAddress } from "viem";
import { verifyPayee, viemReader } from "@x402identity/payee";
import { buildPaymentRequired } from "@/lib/x402/requirements";
import { mainnetClient } from "./clients";
import { envAsync } from "./env";

export type PayeeStatus =
  | { state: "none" }
  | { state: "verified"; name: string; checkedAt: string }
  | { state: "mismatch"; name: string; reason: string; detail?: unknown; checkedAt: string }
  /** A failed read. Never shown as "unverified": a throttle is not a denial. */
  | { state: "unknown"; name: string; reason: string; checkedAt: string };

const TTL = 600;

export async function payeeStatus(opts: { identityName: string | null; payTo: string; origin: string; slug: string; fresh?: boolean }): Promise<PayeeStatus> {
  if (!opts.identityName) return { state: "none" };
  const e = await envAsync();
  const key = `payee:${opts.identityName}:${opts.payTo.toLowerCase()}:${opts.origin}`;
  if (!opts.fresh) {
    const hit = await e.KV.get(key, "json").catch(() => null);
    if (hit) return hit as PayeeStatus;
  }
  const pr = buildPaymentRequired({ url: `${opts.origin}/g/${opts.slug}`, description: "", amountAtomic: 1n, payTo: getAddress(opts.payTo), identityName: opts.identityName });
  let status: PayeeStatus;
  try {
    const verdicts = await verifyPayee(pr as never, opts.origin, viemReader(mainnetClient(e) as never));
    const v = verdicts?.[0];
    const checkedAt = new Date().toISOString();
    if (!v) status = { state: "unknown", name: opts.identityName, reason: "no-verdict", checkedAt };
    else if (v.verdict === true) status = { state: "verified", name: opts.identityName, checkedAt };
    else if (v.verdict === "inconclusive") status = { state: "unknown", name: opts.identityName, reason: v.reason, checkedAt };
    // The verifier reports a normalize() that THREW as "name-not-normalized" with
    // expected "(not normalizable)". Seen once in production (2026-11-08) for a valid
    // name; a crash is not a verdict, so show "couldn't check" and retry soon.
    else if (v.reason === "name-not-normalized" && (v as { detail?: { expected?: string } }).detail?.expected === "(not normalizable)")
      status = { state: "unknown", name: opts.identityName, reason: "resolution-failed", checkedAt };
    else status = { state: "mismatch", name: opts.identityName, reason: v.reason, detail: (v as { detail?: unknown }).detail, checkedAt };
  } catch (err) {
    status = { state: "unknown", name: opts.identityName, reason: "resolution-failed", checkedAt: new Date().toISOString() };
    console.error("payee", err);
  }
  // Cache only definite answers for the full TTL; failed reads briefly.
  await e.KV.put(key, JSON.stringify(status), { expirationTtl: status.state === "unknown" ? 60 : TTL }).catch(() => {});
  return status;
}

export const REASON_TEXT: Record<string, string> = {
  "origin-not-listed": "The name does not list this x402Fi gateway address yet.",
  "payto-not-listed": "The name does not list this payout address for Robinhood Chain.",
  "name-expired": "The name is expired or not registered.",
  "name-in-grace": "The name is in its grace period and must be renewed.",
  "no-records": "The name has no payment records yet.",
  "name-not-normalized": "The name is not in normalized form.",
  "unsupported-name": "This kind of name is not supported.",
  "resolution-failed": "Ethereum could not be reached to check. This is not a failed check.",
};
