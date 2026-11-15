import { describe, expect, it } from "vitest";
import { buildTryUrl, fieldKind, fieldLabel, fileError, formatBytes, jsonBodyError, MAX_FILE_BYTES, tryFields, validateField } from "@/lib/tryit-fields";

describe("Try it body", () => {
  it("checks the file before signing: present, not empty, within the gateway's 1 MB", () => {
    expect(fileError(null)).toMatch(/Pick a file/);
    expect(fileError({ size: 0 })).toMatch(/empty/);
    expect(fileError({ size: MAX_FILE_BYTES })).toBeNull();
    expect(fileError({ size: MAX_FILE_BYTES + 1 })).toMatch(/limit is 1 MB/);
    expect(MAX_FILE_BYTES).toBe(1_000_000);
  });

  it("checks the JSON body, and lets an empty one through (sent as {})", () => {
    expect(jsonBodyError('{"hello":"world"}')).toBeNull();
    expect(jsonBodyError("  ")).toBeNull();
    expect(jsonBodyError("{hello}")).toMatch(/valid JSON/);
  });

  it("formats sizes", () => {
    expect(formatBytes(17)).toBe("17 B");
    expect(formatBytes(245_300)).toBe("245.3 KB");
    expect(formatBytes(1_200_000)).toBe("1.2 MB");
  });
});

const A = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

describe("Try it fields", () => {
  it("reads the kind from the example value and the parameter name", () => {
    expect(fieldKind("token", A)).toBe("address");
    expect(fieldKind("wallet", A)).toBe("wallet");
    expect(fieldKind("sizeUsdg", "1000")).toBe("number");
    expect(fieldKind("symbol", "AAPL")).toBe("text");
    expect(fieldKind("token", "0x123")).toBe("text");
  });

  it("labels camelCase and snake_case keys", () => {
    expect(fieldLabel("sizeUsdg")).toBe("Size usdg");
    expect(fieldLabel("token_address")).toBe("Token address");
    expect(fieldLabel("symbol")).toBe("Symbol");
  });

  it("validates addresses and numbers, and lets empty values through", () => {
    const [token, size] = tryFields({ token: A, sizeUsdg: "1000" });
    expect(validateField(token, A.toLowerCase())).toBeNull();
    expect(validateField(token, "0xabc")).toMatch(/0x address/);
    expect(validateField(token, "  ")).toBeNull();
    expect(validateField(size, "12.5")).toBeNull();
    expect(validateField(size, "ten")).toMatch(/number/);
  });

  it("builds the URL from the visitor's values, dropping empty ones", () => {
    const f = tryFields({ symbol: "AAPL", sizeUsdg: "1000" });
    expect(buildTryUrl("stockfi-trade", "/v1/preflight/quote", f, { symbol: " TSLA ", sizeUsdg: "250" })).toBe("/g/stockfi-trade/v1/preflight/quote?symbol=TSLA&sizeUsdg=250");
    expect(buildTryUrl("stockfi-trade", "/v1/preflight/quote", f, { symbol: "TSLA", sizeUsdg: "" })).toBe("/g/stockfi-trade/v1/preflight/quote?symbol=TSLA");
    expect(buildTryUrl("x", "", [], {})).toBe("/g/x");
  });
});
