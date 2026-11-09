import { describe, it, expect } from "vitest";
import { receiptChecks } from "@/lib/receiptChecks";
import { cardVersion } from "@/lib/share";

const scan = (decision: string, truncated = false) => JSON.stringify({ decision, truncated, codes: ["X402-202"], findings: [{ excerpt: "secret" }] });
const row = (o: Partial<Parameters<typeof receiptChecks>[0]> = {}) => ({ status: "settled", amountAtomic: "10000", upstreamStatus: 200, responseSha256: "ab".repeat(32), deliveryScan: scan("allow"), ...o });
const titles = (c: ReturnType<typeof receiptChecks>) => c.map((x) => x.title);

describe("receipt checks card", () => {
  it("a settled proxied payment shows all five checks, all passed", () => {
    const c = receiptChecks(row(), "fixed");
    expect(titles(c)).toEqual(["Payment verified before the call", "Usable once", "Charged only after the service answered", "Response fingerprinted", "Response scanned"]);
    expect(c.every((x) => x.state === "pass")).toBe(true);
    expect(c[0].detail).toContain("$0.01 USDG");
    expect(c.find((x) => x.title === "Response fingerprinted")?.value).toBe("ab".repeat(32));
  });

  it("an older receipt (no hash, no scan) claims only what ran", () => {
    expect(titles(receiptChecks(row({ responseSha256: null, deliveryScan: null }), "fixed"))).toEqual(["Payment verified before the call", "Usable once", "Charged only after the service answered"]);
  });

  it("a flagged response warns, and never shows codes or excerpts", () => {
    const c = receiptChecks(row({ deliveryScan: scan("refuse") }), "fixed");
    const flagged = c.find((x) => x.title === "Response flagged")!;
    expect(flagged.state).toBe("warn");
    expect(JSON.stringify(c)).not.toMatch(/X402-|secret/);
  });

  it("an unreadable or truncated scan is never reported as clean", () => {
    expect(receiptChecks(row({ deliveryScan: scan("abstain") }), "fixed").at(-1)?.title).toBe("Response not fully scanned");
    expect(receiptChecks(row({ deliveryScan: scan("allow", true) }), "fixed").at(-1)?.detail).toContain("in the part scanned");
    expect(titles(receiptChecks(row({ deliveryScan: "{not json" }), "fixed"))).not.toContain("Response scanned");
  });

  it("a service error says nothing was charged", () => {
    const c = receiptChecks(row({ status: "upstream_failed", upstreamStatus: 503, responseSha256: null, deliveryScan: null }), "fixed");
    expect(c.at(-1)).toMatchObject({ state: "fail", title: "Not charged" });
    expect(c.at(-1)?.detail).toContain("HTTP 503");
  });

  it("a registration (contract mode) is paid and delivered in one transaction", () => {
    const c = receiptChecks(row({ upstreamStatus: null, responseSha256: null, deliveryScan: null }), "contract");
    expect(titles(c)).toContain("Paid and delivered together");
    expect(titles(c)).not.toContain("Charged only after the service answered");
  });

  it("a pending payment makes no claims yet", () => {
    expect(receiptChecks(row({ status: "pending" }), "fixed")).toEqual([]);
  });
});

describe("card version for X's cache", () => {
  const base = { name: "HoodFi Names", summary: "Look up names.", category: "Data feeds", identityName: "hoodfi.402api.eth", logoUrl: null, services: [{ status: "live", pricing: "free", priceAtomic: null }] };
  it("is stable for the same card and changes when the card would", () => {
    expect(cardVersion(base)).toBe(cardVersion({ ...base }));
    for (const change of [{ name: "HoodFi" }, { summary: "x" }, { logoUrl: "https://a/b.png" }, { identityName: null }, { services: [{ status: "live", pricing: "fixed", priceAtomic: "10000" }] }]) {
      expect(cardVersion({ ...base, ...change })).not.toBe(cardVersion(base));
    }
    expect(cardVersion(base)).toMatch(/^[0-9a-z]{1,7}$/);
  });
});
