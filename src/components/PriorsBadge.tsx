import type { PriorsRecord } from "@/lib/priors";

/**
 * The payout wallet's Priors credit record (priors.trade): what this agent has actually
 * repaid on Robinhood Chain. Shown only when there is a record; a failed lookup shows
 * nothing rather than implying there is none.
 */
export function PriorsBadge({ record }: { record: PriorsRecord }) {
  if (record.state !== "found") return null;
  const tone = record.defaulted ? "text-bad" : record.verdict === "repaid" ? "text-good" : "text-ink-2";
  const title = record.defaulted ? "Defaulted on a Priors loan" : record.verdict === "repaid" ? "Priors credit record" : "On Priors, no repayments yet";
  return (
    <div className="card p-4 text-sm">
      <div className={`flex items-center gap-2 font-medium ${tone}`}>
        {/* Priors' own mark, unaltered (priors.trade/logo.svg). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a 1 KB static SVG */}
        <img src="/partners/priors.svg" alt="Priors" width={20} height={20} className="h-5 w-5 shrink-0 rounded-[5px]" />
        {title}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-card p-2">
          <dt className="text-[0.68rem] uppercase tracking-wider text-ink-3">Score</dt>
          <dd className="display text-2xl">{record.score ?? "—"}</dd>
        </div>
        <div className="rounded-lg bg-card p-2">
          <dt className="text-[0.68rem] uppercase tracking-wider text-ink-3">Repaid</dt>
          <dd className="display text-2xl">{record.loansRepaid}</dd>
        </div>
        <div className="rounded-lg bg-card p-2">
          <dt className="text-[0.68rem] uppercase tracking-wider text-ink-3">USDG</dt>
          <dd className="display text-2xl">{record.volumeRepaidUsdg.toLocaleString()}</dd>
        </div>
      </dl>
      <p className="mt-3 text-ink-3">
        ERC-8004 agent #{record.agentId}{record.rungName ? ` · ${record.rungName}` : ""}. Built from on-chain repayments of
        debt someone else put at risk.{" "}
        <a href={record.page} target="_blank" rel="noopener noreferrer" className="underline">View on Priors</a>
      </p>
    </div>
  );
}
