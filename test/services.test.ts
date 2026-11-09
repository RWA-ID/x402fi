import { describe, it, expect } from "vitest";
import { matchService, pathMatches, quoteRequestPath, parseQuote, normalizePath, allowedMethods, labelFromPath, type ServiceLike } from "@/lib/gateway/services";

const svc = (o: Partial<ServiceLike> & { id: string }): ServiceLike => ({
  method: "GET", path: "/", pricing: "fixed", priceAtomic: "1000", quotePath: null, maxPriceAtomic: null, status: "live", sortOrder: 0, ...o,
});

describe("path matching", () => {
  it("normalizes and matches prefixes on segment boundaries", () => {
    expect(normalizePath("register/")).toBe("/register");
    expect(normalizePath("")).toBe("/");
    expect(pathMatches("/register", "/register/alice")).toBe(true);
    expect(pathMatches("/register", "/register")).toBe(true);
    expect(pathMatches("/register", "/registers")).toBe(false); // not a segment boundary
    expect(pathMatches("/", "/anything/at/all")).toBe(true);
  });
});

describe("matchService", () => {
  const all = [
    svc({ id: "catchall", path: "/", pricing: "free" }),
    svc({ id: "lookup", path: "/owner", pricing: "free" }),
    svc({ id: "register", path: "/register", method: "POST", pricing: "quote", maxPriceAtomic: "15000000", quotePath: "/quote" }),
    svc({ id: "paused", path: "/owner/secret", status: "paused" }),
  ];
  it("picks the longest live prefix with the same method", () => {
    expect(matchService(all, "GET", "/owner/0xabc/names")?.id).toBe("lookup");
    expect(matchService(all, "POST", "/register/alice")?.id).toBe("register");
    expect(matchService(all, "GET", "/register/alice")?.id).toBe("catchall"); // GET falls through to "/"
    expect(matchService(all, "HEAD", "/owner/x")?.id).toBe("lookup");
  });
  it("never routes to a paused service", () => {
    expect(matchService(all, "GET", "/owner/secret/x")?.id).toBe("lookup");
  });
  it("returns null when nothing matches and reports allowed methods", () => {
    const only = [svc({ id: "r", path: "/register", method: "POST" })];
    expect(matchService(only, "GET", "/register/a")).toBeNull();
    expect(allowedMethods(only, "/register/a")).toEqual(["POST"]);
  });
});

describe("labelFromPath", () => {
  it("takes exactly one segment after the prefix", () => {
    expect(labelFromPath("/register", "/register/alice")).toBe("alice");
    expect(labelFromPath("/register", "/register/alice/")).toBe("alice");
    expect(labelFromPath("/register", "/register/a%2Db")).toBe("a-b");
    expect(labelFromPath("/register", "/register")).toBeNull();
    expect(labelFromPath("/register", "/register/a/b")).toBeNull();
    expect(labelFromPath("/register", "/other/alice")).toBeNull();
    expect(labelFromPath("/register", "/register/" + "a".repeat(65))).toBeNull();
    expect(labelFromPath("/register", "/register/%E0%A4%A")).toBeNull(); // malformed escape
  });
});

describe("quotes", () => {
  it("maps the request path onto the quote path", () => {
    expect(quoteRequestPath({ path: "/register", quotePath: "/quote/register" }, "/register/alice")).toBe("/quote/register/alice");
    expect(quoteRequestPath({ path: "/", quotePath: "/price" }, "/alice")).toBe("/price/alice");
  });
  it("accepts amount or price within the ceiling", () => {
    expect(parseQuote({ amount: "3000000" }, "15000000")).toEqual({ ok: true, amountAtomic: 3_000_000n });
    expect(parseQuote({ price: "5.00" }, "15000000")).toEqual({ ok: true, amountAtomic: 5_000_000n });
  });
  it("refuses quotes above the ceiling, missing, malformed or unavailable", () => {
    expect(parseQuote({ amount: "16000000" }, "15000000")).toMatchObject({ ok: false, reason: "quote_above_ceiling" });
    expect(parseQuote({ amount: "3000000" }, null)).toMatchObject({ ok: false, reason: "quote_without_ceiling" });
    expect(parseQuote({ amount: "-1" }, "15000000")).toMatchObject({ ok: false });
    expect(parseQuote({ price: "abc" }, "15000000")).toMatchObject({ ok: false, reason: "quote_invalid_amount" });
    expect(parseQuote({}, "15000000")).toMatchObject({ ok: false, reason: "quote_missing_amount" });
    expect(parseQuote({ available: false, error: "Name is taken" }, "15000000")).toEqual({ ok: false, reason: "Name is taken" });
    expect(parseQuote("nope", "15000000")).toMatchObject({ ok: false, reason: "quote_not_json" });
    // $0.01 minimum: a quote below it would cost more in gas than it pays.
    expect(parseQuote({ amount: "9999" }, "15000000")).toMatchObject({ ok: false, reason: "quote_below_minimum" });
    expect(parseQuote({ price: "0.01" }, "15000000")).toEqual({ ok: true, amountAtomic: 10_000n });
  });
});
