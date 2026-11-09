import { formatUsd } from "@/lib/x402/money";

/**
 * The "Checks on this payment" card on a receipt. Built only from what x402Fi stored
 * for THIS payment, so it never claims a check that did not run. It says nothing about
 * the buyer's own wallet: whether a buyer used a client-side guard is not something
 * x402Fi can see.
 */
export type CheckState = "pass" | "warn" | "fail";
export interface ReceiptCheck {
  state: CheckState;
  title: string;
  detail: string;
  /** Monospace value under the detail (the response hash). */
  value?: string;
}

interface PaymentRow {
  status: string;
  amountAtomic: string;
  upstreamStatus: number | null;
  responseSha256: string | null;
  deliveryScan: string | null;
}

export function receiptChecks(p: PaymentRow, pricing: string | null): ReceiptCheck[] {
  // A pending payment has not finished either way: no claims yet.
  if (p.status === "pending") return [];
  const out: ReceiptCheck[] = [];
  const contract = pricing === "contract";

  // Every payment row exists only after verifyPayment passed and the nonce was claimed.
  out.push({
    state: "pass",
    title: "Payment verified before the call",
    detail: `Signature, the payer's balance, the exact amount (${formatUsd(p.amountAtomic)} USDG), the listing's payout address, USDG on Robinhood Chain, and a short validity window were all checked before anything happened.`,
  });
  out.push({
    state: "pass",
    title: "Usable once",
    detail: "This authorization was claimed before the call, so it can't be replayed or charged twice.",
  });

  if (contract) {
    out.push(
      p.status === "settled"
        ? { state: "pass", title: "Paid and delivered together", detail: "The name was registered and paid for in one on-chain transaction: both happen, or neither does." }
        : { state: "fail", title: "Not charged", detail: "The registration did not go through, so no payment was taken." },
    );
  } else if (p.status === "upstream_failed") {
    out.push({
      state: "fail",
      title: "Not charged",
      detail: p.upstreamStatus
        ? `The service answered HTTP ${p.upstreamStatus}, so no money moved.`
        : "The service did not answer successfully, so no money moved.",
    });
  } else if (p.upstreamStatus && p.upstreamStatus >= 200 && p.upstreamStatus < 300) {
    out.push({
      state: "pass",
      title: "Charged only after the service answered",
      detail: `The service answered HTTP ${p.upstreamStatus} before any money moved.${p.status === "settle_failed" ? " Settlement then failed, so nothing was charged." : ""}`,
    });
  }

  if (p.responseSha256) {
    out.push({
      state: "pass",
      title: "Response fingerprinted",
      detail: "SHA-256 of the exact bytes delivered. Hash what you received and compare: a match proves it is the response paid for.",
      value: p.responseSha256,
    });
  }

  const scan = parseScan(p.deliveryScan);
  if (scan) {
    out.push(
      scan.decision === "allow"
        ? { state: "pass", title: "Response scanned", detail: `No instructions aimed at AI agents were found${scan.truncated ? " in the part scanned (the response was longer than the scan limit)" : ""}.` }
        : scan.decision === "refuse"
          ? { state: "warn", title: "Response flagged", detail: "The response contained text that reads like instructions to an AI agent. Don't let an agent act on it unreviewed." }
          : { state: "warn", title: "Response not fully scanned", detail: "Part of the response could not be read by the scanner, so it is not reported as clean." },
    );
  }
  return out;
}

function parseScan(raw: string | null): { decision: string; truncated: boolean } | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as { decision?: unknown; truncated?: unknown };
    return typeof s.decision === "string" ? { decision: s.decision, truncated: s.truncated === true } : null;
  } catch {
    return null;
  }
}
