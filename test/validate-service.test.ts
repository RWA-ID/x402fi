import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({ currentSeller: async () => null }));
vi.mock("@/lib/server/env", () => ({ db: () => ({}), envAsync: async () => ({}) }));

const { validateService } = await import("@/lib/server/services");

const base = { name: "Pin", method: "POST", path: "/pin", pricing: "fixed" as const, price: "0.01" };

describe("validateService: example response", () => {
  it("accepts valid JSON and plain text", () => {
    expect(validateService({ ...base, exampleResponse: '{"cid":"bafy"}' }).ok).toBe(true);
    expect(validateService({ ...base, exampleResponse: "OK, pinned." }).ok).toBe(true);
  });
  it("rejects text that looks like JSON but does not parse (the double-escaped case)", () => {
    const r = validateService({ ...base, exampleResponse: '{\\n  "registered": true\\n}' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.exampleResponse).toMatch(/does not parse/);
  });
  it("clears it with an empty string", () => {
    const r = validateService({ ...base, exampleResponse: "  " });
    expect(r.ok && r.value.exampleResponse).toBeNull();
  });
});

describe("validateService: free and example requests", () => {
  it("a free endpoint needs no price", () => {
    expect(validateService({ name: "Status", method: "GET", path: "/status", pricing: "free", price: null }).ok).toBe(true);
  });
  it("a fixed endpoint still needs one", () => {
    expect(validateService({ name: "Pin", method: "POST", path: "/pin", pricing: "fixed", price: null }).ok).toBe(false);
  });
  it("stores a bare k=v example as a query", () => {
    const r = validateService({ ...base, exampleRequest: "token=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" });
    expect(r.ok && r.value.exampleRequest).toBe("?token=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
  });
  it("leaves paths and ?queries alone", () => {
    for (const ex of ["?symbol=AAPL", "/register/yourname", "/owner/0xabc/names?x=1"]) {
      const r = validateService({ ...base, exampleRequest: ex });
      expect(r.ok && r.value.exampleRequest).toBe(ex);
    }
  });
});
