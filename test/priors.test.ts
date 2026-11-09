import { describe, it, expect } from "vitest";
import { toPriorsRecord } from "@/lib/priors";

// Shape of https://priors.trade/api/check (read live 2026-11-09).
const agent = (o: object = {}) => ({
  agentId: 437,
  name: "agent",
  record: { loansRepaid: 7, volumeRepaidUsdg: 35, defaulted: false },
  scoreV2: { score: 11, rungName: "unproven" },
  links: { badge: "https://priors.trade/api/badge/437.svg", page: "https://priors.trade/agent?id=437" },
  ...o,
});

describe("toPriorsRecord", () => {
  it("maps a repaid agent", () => {
    expect(toPriorsRecord({ verdict: "repaid", agents: [agent()] })).toEqual({
      state: "found", verdict: "repaid", agentId: 437, name: "agent", score: 11, rungName: "unproven",
      loansRepaid: 7, volumeRepaidUsdg: 35, defaulted: false,
      page: "https://priors.trade/agent?id=437", badge: "https://priors.trade/api/badge/437.svg",
    });
  });
  it("no record is 'none', an unexpected verdict is 'unknown' (never shown as a clean record)", () => {
    expect(toPriorsRecord({ verdict: "no record", agents: [] })).toEqual({ state: "none" });
    expect(toPriorsRecord({ verdict: "weird", agents: [agent()] })).toEqual({ state: "unknown" });
  });
  it("flags a default and keeps a stale score as null", () => {
    const r = toPriorsRecord({ verdict: "defaulted", agents: [agent({ scoreV2: null, record: { loansRepaid: 1, defaulted: true } })] });
    expect(r).toMatchObject({ state: "found", defaulted: true, score: null });
  });
  it("picks the agent with the most repaid when an address owns several", () => {
    const r = toPriorsRecord({ verdict: "repaid", agents: [agent({ agentId: 1, record: { loansRepaid: 1 } }), agent({ agentId: 2, record: { loansRepaid: 9 } })] });
    expect(r).toMatchObject({ agentId: 2 });
  });
  it("never links anywhere but priors.trade", () => {
    const r = toPriorsRecord({ verdict: "repaid", agents: [agent({ links: { page: "https://evil.example/x", badge: "javascript:alert(1)" } })] });
    expect(r).toMatchObject({ page: "https://priors.trade/agent?id=437", badge: "https://priors.trade/api/badge/437.svg" });
  });
});
