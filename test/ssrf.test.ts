import { describe, it, expect } from "vitest";
import { assertSafeUrl, assertSafeUrlSyntax, isPrivateIPv6, isPrivateIPv4 } from "@/lib/ssrf";

const bad = [
  "http://example.com",
  "https://localhost/x",
  "https://127.0.0.1/",
  "https://2130706433/",
  "https://0x7f000001/",
  "https://10.1.2.3/",
  "https://169.254.169.254/latest/meta-data",
  "https://[::1]/",
  "https://[::ffff:127.0.0.1]/",
  "https://[::ffff:7f00:1]/",
  "https://[::ffff:169.254.169.254]/",
  "https://[fd00::1]/",
  "https://[fe80::1]/",
  "https://[64:ff9b::10.0.0.1]/",
  "https://user:pw@example.com/",
  "https://example.com:8443/",
  "https://metadata.internal/",
];
const good = ["https://api.example.com/v1/x", "https://8.8.8.8/", "https://[2606:4700::1111]/"];

describe("SSRF guard", () => {
  it("rejects private and malformed targets", () => {
    for (const u of bad) expect(() => assertSafeUrlSyntax(u), u).toThrow();
  });
  it("allows public targets (control)", () => {
    for (const u of good) expect(() => assertSafeUrlSyntax(u), u).not.toThrow();
  });
  it("classifies addresses", () => {
    expect(isPrivateIPv6("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIPv6("2606:4700::1111")).toBe(false);
    expect(isPrivateIPv4("100.64.0.1")).toBe(true);
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
  });
  it("rejects a public name that resolves to a private address", async () => {
    const resolver = async (_h: string, t: "A" | "AAAA") => (t === "A" ? ["8.8.8.8", "10.0.0.5"] : []);
    await expect(assertSafeUrl("https://evil.example.com/", resolver)).rejects.toThrow(/private/);
    const ok = async (_h: string, t: "A" | "AAAA") => (t === "A" ? ["8.8.8.8"] : []);
    await expect(assertSafeUrl("https://fine.example.com/", ok)).resolves.toBeInstanceOf(URL);
  });
});
