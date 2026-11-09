import { describe, it, expect } from "vitest";
import { parseNative402 } from "@/lib/x402/native";
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
    expect(r).toEqual({ ok: true, quote: { x402Version: 2, amount: "200000", payTo: PAYTO, payeeName: "agent002.402bot.eth", description: "2 minutes of worker time", networks: ["eip155:8453", "eip155:4663"] } });
  });
  it("falls back to the JSON body, and reads v1 (network robinhood, maxAmountRequired)", () => {
    const v1 = { x402Version: 1, accepts: [{ scheme: "exact", network: "robinhood", maxAmountRequired: "10000", asset: USDG, payTo: PAYTO, description: "stock price" }] };
    const r = parseNative402(402, null, JSON.stringify(v1));
    expect(r).toMatchObject({ ok: true, quote: { x402Version: 1, amount: "10000", payTo: PAYTO, payeeName: null, description: "stock price" } });
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
