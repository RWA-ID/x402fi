import { describe, it, expect } from "vitest";
import { acceptAmount, nativeAccept, parseNative402, paymentHeader } from "@/lib/x402/native";
import { encodeHeader } from "@/lib/x402/encoding";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const PAYTO = "0x318aE0BDf31bCd3528c34Cb34063b9B537c432D9";
const v2 = {
  x402Version: 2,
  resource: { url: "https://seller.example/jobs", description: "2 minutes of worker time" },
  accepts: [
    { scheme: "exact", network: "eip155:8453", amount: "200000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAYTO },
    { scheme: "exact", network: "eip155:4663", amount: "200000", asset: USDG, payTo: PAYTO },
  ],
  extensions: { "payee-name": { info: { name: "agent002.402bot.eth" } } },
};

describe("parseNative402", () => {
  it("reads the USDG/Robinhood option from the v2 header, with the payee name", () => {
    const r = parseNative402(402, encodeHeader(v2), "");
    expect(r).toEqual({ ok: true, quote: { x402Version: 2, network: "eip155:4663", amount: "200000", payTo: PAYTO, payeeName: "agent002.402bot.eth", description: "2 minutes of worker time", networks: ["eip155:8453", "eip155:4663"], bazaar: null } });
  });
  it("falls back to the JSON body, and reads v1 (network robinhood, maxAmountRequired)", () => {
    const v1 = { x402Version: 1, accepts: [{ scheme: "exact", network: "robinhood", maxAmountRequired: "10000", asset: USDG, payTo: PAYTO, description: "stock price" }] };
    const r = parseNative402(402, null, JSON.stringify(v1));
    expect(r).toMatchObject({ ok: true, quote: { x402Version: 1, network: "robinhood", amount: "10000", payTo: PAYTO, payeeName: null, description: "stock price" } });
  });
  it("re-states a v1 endpoint's option as v1, and a v2 one as v2", () => {
    const v1 = { x402Version: 1, accepts: [{ scheme: "exact", network: "robinhood", maxAmountRequired: "10000", asset: USDG, payTo: PAYTO, maxTimeoutSeconds: 60 }] };
    const r1 = parseNative402(402, null, JSON.stringify(v1));
    if (!r1.ok) throw new Error(r1.reason);
    const a1 = nativeAccept(r1.quote, "https://seller.example/price", "stock price");
    expect(a1).toEqual({
      scheme: "exact", network: "robinhood", maxAmountRequired: "10000", resource: "https://seller.example/price", description: "stock price",
      mimeType: "application/json", payTo: PAYTO, maxTimeoutSeconds: 60, asset: USDG, extra: { name: "Global Dollar", version: "1" },
    });
    expect(a1).not.toHaveProperty("amount");
    expect(acceptAmount(a1)).toBe("10000");
    expect(paymentHeader(r1.quote.x402Version)).toBe("X-PAYMENT");

    const r2 = parseNative402(402, encodeHeader(v2), "");
    if (!r2.ok) throw new Error(r2.reason);
    const a2 = nativeAccept(r2.quote, "https://seller.example/jobs", "");
    expect(a2).toEqual({ scheme: "exact", network: "eip155:4663", amount: "200000", payTo: PAYTO, maxTimeoutSeconds: 120, asset: USDG, extra: { name: "Global Dollar", version: "1" } });
    expect(acceptAmount(a2)).toBe("200000");
    expect(paymentHeader(r2.quote.x402Version)).toBe("PAYMENT-SIGNATURE");
  });
  it("ignores an unusable maxTimeoutSeconds and survives a probe cached without a network", () => {
    const odd = { x402Version: 1, accepts: [{ scheme: "exact", network: "robinhood", maxAmountRequired: "10000", asset: USDG, payTo: PAYTO, maxTimeoutSeconds: "soon" }] };
    const r = parseNative402(402, null, JSON.stringify(odd));
    if (!r.ok) throw new Error(r.reason);
    expect(r.quote.maxTimeoutSeconds).toBeUndefined();
    const stale = { ...r.quote, network: undefined as unknown as string };
    expect(nativeAccept(stale, "https://seller.example/price", "")).toMatchObject({ network: "robinhood", maxAmountRequired: "10000", maxTimeoutSeconds: 120 });
  });
  it("refuses what x402Fi cannot list", () => {
    expect(parseNative402(200, null, "{}")).toMatchObject({ ok: false });
    expect(parseNative402(402, null, "not json")).toMatchObject({ ok: false });
    expect(parseNative402(402, null, JSON.stringify({ accepts: [] }))).toMatchObject({ ok: false });
    // Base only: no USDG on Robinhood Chain
    expect(parseNative402(402, null, JSON.stringify({ accepts: [v2.accepts[0]] }))).toMatchObject({ ok: false, reason: expect.stringContaining("USDG") });
    // a token that is not USDG on 4663
    expect(parseNative402(402, null, JSON.stringify({ accepts: [{ ...v2.accepts[1], asset: PAYTO }] }))).toMatchObject({ ok: false });
    expect(parseNative402(402, null, JSON.stringify({ accepts: [{ ...v2.accepts[1], amount: "0" }] }))).toMatchObject({ ok: false });
    expect(parseNative402(402, null, JSON.stringify({ accepts: [{ ...v2.accepts[1], payTo: "nope" }] }))).toMatchObject({ ok: false });
  });
  it("ignores a malformed payee name instead of trusting it", () => {
    const bad = { ...v2, extensions: { "payee-name": { info: { name: "<script>" } } } };
    expect(parseNative402(402, encodeHeader(bad), "")).toMatchObject({ ok: true, quote: { payeeName: null } });
  });
});
