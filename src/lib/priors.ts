/**
 * A payout wallet's Priors credit record (https://priors.trade, ERC-8004 agents on
 * Robinhood Chain), from Priors' keyless check API. Verified Payee answers "does this
 * payee belong to the endpoint's owner?"; Priors answers "does this agent repay its debts?".
 */
export type PriorsRecord =
  | { state: "none" }
  | { state: "unknown" } // the lookup failed: never shown as "no record"
  | {
      state: "found";
      verdict: "repaid" | "no repayments yet" | "defaulted";
      agentId: number;
      name: string | null;
      score: number | null; // Priors Score v2 (0-1000), null while stale
      rungName: string | null;
      loansRepaid: number;
      volumeRepaidUsdg: number;
      defaulted: boolean;
      page: string;
      badge: string;
    };

export interface CheckResponse {
  verdict?: string;
  agents?: Array<{
    agentId: number;
    name?: string | null;
    record?: { loansRepaid?: number; volumeRepaidUsdg?: number; defaulted?: boolean };
    scoreV2?: { score?: number; rungName?: string } | null;
    links?: { badge?: string; page?: string };
  }>;
}

/** Pure: the check API's answer → what x402Fi shows. Picks the agent with the most repaid. */
export function toPriorsRecord(body: CheckResponse): PriorsRecord {
  const verdict = body.verdict;
  const agents = Array.isArray(body.agents) ? body.agents : [];
  if (verdict === "no record" || agents.length === 0) return { state: "none" };
  if (verdict !== "repaid" && verdict !== "no repayments yet" && verdict !== "defaulted") return { state: "unknown" };
  const a = [...agents].sort((x, y) => (y.record?.loansRepaid ?? 0) - (x.record?.loansRepaid ?? 0))[0];
  const https = (u: unknown, fallback: string) => (typeof u === "string" && u.startsWith("https://priors.trade/") ? u : fallback);
  return {
    state: "found",
    verdict,
    agentId: Number(a.agentId),
    name: typeof a.name === "string" ? a.name.slice(0, 60) : null,
    score: typeof a.scoreV2?.score === "number" ? a.scoreV2.score : null,
    rungName: typeof a.scoreV2?.rungName === "string" ? a.scoreV2.rungName.slice(0, 30) : null,
    loansRepaid: Number(a.record?.loansRepaid ?? 0),
    volumeRepaidUsdg: Number(a.record?.volumeRepaidUsdg ?? 0),
    defaulted: verdict === "defaulted" || a.record?.defaulted === true,
    page: https(a.links?.page, `https://priors.trade/agent?id=${Number(a.agentId)}`),
    badge: https(a.links?.badge, `https://priors.trade/api/badge/${Number(a.agentId)}.svg`),
  };
}

