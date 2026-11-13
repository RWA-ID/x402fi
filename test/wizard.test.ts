import { describe, expect, it } from "vitest";
import { suggestLabels, toLabel, isLabel } from "@/lib/names";
import { baseLooksLikeEndpoint, normalizePath, upstreamFor } from "@/lib/wizard";

describe("name suggestions from a service name", () => {
  it("StockFi Trade → stockfi-trade, stockfi, stockfitrade", () => {
    expect(suggestLabels("StockFi Trade")).toEqual(["stockfi-trade", "stockfi", "stockfitrade", "stockfi-api"]);
  });
  it("drops filler words for the short form", () => {
    expect(suggestLabels("The Acme Data API")[1]).toBe("acme");
  });
  it("never suggests labels under 4 characters or invalid ones", () => {
    for (const l of suggestLabels("AI X")) expect(l.length).toBeGreaterThanOrEqual(4);
    for (const l of suggestLabels("Ünïcode & Co!!")) expect(isLabel(l)).toBe(true);
    expect(suggestLabels("")).toEqual([]);
  });
  it("normalizes typed labels and full names", () => {
    expect(toLabel("Acme Data")).toBe("acme-data");
    expect(toLabel("acme.hoodfi.eth")).toBe("acme");
    expect(toLabel("acme.402api.eth")).toBe("acme");
    expect(toLabel("---")).toBeNull();
  });
});

describe("endpoint URLs", () => {
  it("normalizes paths like the server", () => {
    expect(normalizePath("v1/rates/")).toBe("/v1/rates");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("//a//b")).toBe("/a/b");
  });
  it("joins base + path + example the way the gateway forwards", () => {
    expect(upstreamFor("https://stockfi.trade", "/v1/preflight", "?symbol=AAPL")).toBe("https://stockfi.trade/v1/preflight?symbol=AAPL");
    expect(upstreamFor("https://api.acme.com/base/", "/rates", "/EURUSD?x=1")).toBe("https://api.acme.com/base/rates/EURUSD?x=1");
    expect(upstreamFor("https://api.acme.com", "/", "")).toBe("https://api.acme.com/");
  });
  it("flags a base URL that is really one endpoint", () => {
    expect(baseLooksLikeEndpoint("https://stockfi.trade/v1/preflight")).toEqual({ origin: "https://stockfi.trade", path: "/v1/preflight" });
    expect(baseLooksLikeEndpoint("https://api.acme.com/api/rates")).toEqual({ origin: "https://api.acme.com", path: "/api/rates" });
    expect(baseLooksLikeEndpoint("https://api.acme.com")).toBeNull();
    expect(baseLooksLikeEndpoint("https://acme.com/rates-service")).toBeNull();
  });
});
