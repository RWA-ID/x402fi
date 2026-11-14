import type { PayeeStatus } from "@/lib/server/payee";
import { REASON_TEXT } from "@/lib/server/payee";
import { PayeeSeal } from "./PayeeSeal";

export function PayeeBadge({ status }: { status: PayeeStatus }) {
  if (status.state === "none") {
    return (
      <div className="card p-5 text-sm">
        <div className="font-medium">No named payee</div>
        <p className="mt-1 text-ink-3">This seller has not linked an x402 Identity name, so buyers see only a wallet address.</p>
      </div>
    );
  }
  const tone = status.state === "verified" ? "text-good" : status.state === "mismatch" ? "text-bad" : "text-warn";
  const title = status.state === "verified" ? "Verified payee" : status.state === "mismatch" ? "Payee not confirmed" : "Couldn't check right now";
  const body =
    status.state === "verified"
      ? `The ENS name ${status.name} lists both this service's address and its payout wallet. Only the name's owner can set those records.`
      : REASON_TEXT[status.reason] ?? status.reason;
  return (
    <div className="card p-5 text-sm">
      <div className={`flex items-center gap-2 font-medium ${tone}`}>
        {status.state === "verified" ? (
          <PayeeSeal className="h-[18px] w-[18px]" />
        ) : (
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {status.state === "mismatch" ? <path d="M4 4l8 8M12 4l-8 8" /> : <><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 11h.01" /></>}
          </svg>
        )}
        {title}
      </div>
      <p className="mt-1 font-mono text-[0.8rem]">{status.name}</p>
      <p className="mt-2 text-ink-3">{body}</p>
      <p className="mt-3 text-xs text-ink-3">Checked {new Date(status.checkedAt).toUTCString()} via the x402 payee-name spec.</p>
    </div>
  );
}
