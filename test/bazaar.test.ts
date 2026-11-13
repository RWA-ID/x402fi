import { describe, it, expect } from "vitest";
import { bazaarExtension, isBazaarExtension, parseExample } from "@/lib/x402/bazaar";
import { buildPaymentRequired } from "@/lib/x402/requirements";
import { parseNative402 } from "@/lib/x402/native";
import { USDG, NETWORK } from "@/lib/chains";

const ep = (over: Partial<Parameters<typeof bazaarExtension>[0]> = {}) => ({
  method: "GET", path: "/", pricing: "fixed", exampleRequest: null, exampleBody: null, exampleResponse: null, ...over,
});

describe("parseExample", () => {
  it("reads a ?query", () => {
    expect(parseExample("/v1/preflight", "?symbol=AAPL&sizeUsdg=1000")).toEqual({ subPath: "", query: { symbol: "AAPL", sizeUsdg: "1000" } });
  });
  it("reads a bare k=v as a query, not a path", () => {
    expect(parseExample("/", "token=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168")).toEqual({ subPath: "", query: { token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" } });
  });
  it("drops the endpoint's own path from an example that repeats it", () => {
    expect(parseExample("/register", "/register/yourname")).toEqual({ subPath: "/yourname", query: {} });
    expect(parseExample("/owner", "/owner/0xabc/names?x=1")).toEqual({ subPath: "/0xabc/names", query: { x: "1" } });
  });
  it("keeps a relative extra path", () => {
    expect(parseExample("/register", "yourname")).toEqual({ subPath: "/yourname", query: {} });
  });
  it("is empty without an example", () => {
    expect(parseExample("/", null)).toEqual({ subPath: "", query: {} });
    expect(parseExample("/", "  ")).toEqual({ subPath: "", query: {} });
  });
});

describe("bazaarExtension", () => {
  it("describes a GET with query params and a JSON example output", () => {
    const b = bazaarExtension(ep({ path: "/v1/preflight", exampleRequest: "?symbol=AAPL", exampleResponse: '{"verdict":"GO"}' }), "/g/stockfi-trade/v1/preflight");
    expect(b.info).toEqual({
      input: { type: "http", method: "GET", queryParams: { symbol: "AAPL" } },
      output: { type: "json", example: { verdict: "GO" } },
    });
    expect(b.routeTemplate).toBeUndefined();
    const input = (b.schema.properties as Record<string, { properties: Record<string, unknown>; required: string[] }>).input;
    expect(input.required).toEqual(["type", "method"]);
    expect(input.properties.queryParams).toEqual({ type: "object", properties: { symbol: { type: "string" } } });
  });

  it("omits output when the stored example is not valid JSON", () => {
    const b = bazaarExtension(ep({ exampleResponse: '{\\n  "registered": true' }), "/g/x");
    expect(b.info.output).toBeUndefined();
    expect((b.schema.properties as Record<string, unknown>).output).toBeUndefined();
  });

  it("gives a POST a JSON body (empty when no example)", () => {
    const withBody = bazaarExtension(ep({ method: "post", exampleBody: '{"minutes":2}' }), "/g/x");
    expect(withBody.info.input).toMatchObject({ method: "POST", bodyType: "json", body: { minutes: 2 } });
    const noBody = bazaarExtension(ep({ method: "POST", exampleBody: "[1,2]" }), "/g/x");
    expect(noBody.info.input.body).toEqual({});
    const input = (noBody.schema.properties as Record<string, { required: string[] }>).input;
    expect(input.required).toEqual(["type", "method", "bodyType", "body"]);
  });

  it("templates a contract endpoint's label as a :name path param", () => {
    const b = bazaarExtension(ep({ method: "POST", path: "/register", pricing: "contract", exampleRequest: "/register/yourname" }), "/g/hoodfi-names/register");
    expect(b.routeTemplate).toBe("/g/hoodfi-names/register/:name");
    expect(b.info.input.pathParams).toEqual({ name: "yourname" });
  });

  it("uses no external $ref (rejected by Bazaar validators)", () => {
    const b = bazaarExtension(ep({ method: "POST", pricing: "contract", path: "/r", exampleRequest: "?a=1" }), "/g/x/r");
    expect(JSON.stringify(b.schema)).not.toMatch(/"\$(ref|id)"/);
  });
});

describe("402 carries the bazaar extension", () => {
  it("next to payee-name", () => {
    const bazaar = bazaarExtension(ep({ exampleRequest: "?q=1" }), "/g/x");
    const pr = buildPaymentRequired({ url: "https://x402fi.dev/g/x", description: "d", amountAtomic: 1n, payTo: "0x1111111111111111111111111111111111111111", identityName: "x.hoodfi.eth", bazaar });
    expect(pr.extensions).toEqual({ "payee-name": { info: { name: "x.hoodfi.eth" } }, bazaar });
  });
  it("and leaves extensions out when there is nothing to declare", () => {
    const pr = buildPaymentRequired({ url: "https://x/g/a", description: "d", amountAtomic: 1n, payTo: "0x1111111111111111111111111111111111111111" });
    expect(pr.extensions).toBeUndefined();
  });
});

describe("native 402s", () => {
  const accepts = [{ scheme: "exact", network: NETWORK, amount: "10000", asset: USDG.address, payTo: "0x1111111111111111111111111111111111111111" }];
  it("keeps a seller's valid bazaar declaration", () => {
    const bazaar = bazaarExtension(ep({ exampleRequest: "?q=1" }), "/api");
    const p = parseNative402(402, null, JSON.stringify({ x402Version: 2, accepts, extensions: { bazaar } }));
    expect(p.ok && p.quote.bazaar).toEqual(bazaar);
  });
  it("drops a malformed one", () => {
    expect(isBazaarExtension({ info: { input: { type: "mcp" } }, schema: {} })).toBe(false);
    const p = parseNative402(402, null, JSON.stringify({ x402Version: 2, accepts, extensions: { bazaar: { info: "nope" } } }));
    expect(p.ok && p.quote.bazaar).toBeNull();
  });
});
