import { describe, it, expect } from "vitest";
import { parseXHandle, parseWebsite, parseLogo, mergeProfile } from "@/lib/profile";

describe("parseXHandle", () => {
  it("accepts handles and profile links", () => {
    for (const s of ["hoodfi", "@hoodfi", "https://x.com/hoodfi", "x.com/hoodfi/", "https://twitter.com/HoodFi", "https://x.com/hoodfi?s=21"]) {
      expect(parseXHandle(s)?.toLowerCase(), s).toBe("hoodfi");
    }
    expect(parseXHandle("")).toBeNull();
  });
  it("rejects other links and non-profiles", () => {
    for (const s of ["https://evil.com/hoodfi", "javascript:alert(1)", "a".repeat(16), "x.com/home", "bad handle", "https://x.com/hoodfi/status/1"]) {
      expect(() => parseXHandle(s), s).toThrow();
    }
  });
});

describe("parseWebsite", () => {
  it("normalizes to https", () => {
    expect(parseWebsite("hoodfi.name")).toBe("https://hoodfi.name/");
    expect(parseWebsite("https://www.hoodfi.name/about")).toBe("https://www.hoodfi.name/about");
  });
  it("refuses unsafe links (control: public https passes above)", () => {
    for (const s of ["http://hoodfi.name", "javascript:alert(1)", "data:text/html,hi", "https://user:pw@hoodfi.name", "localhost", "ftp://x.com"]) {
      expect(() => parseWebsite(s), s).toThrow();
    }
  });
});

describe("parseLogo", () => {
  it("maps ipfs to a gateway and keeps https", () => {
    expect(parseLogo("ipfs://bafyabc/logo.png")).toBe("https://ipfs.io/ipfs/bafyabc/logo.png");
    expect(parseLogo("https://cdn.x/logo.png")).toBe("https://cdn.x/logo.png");
  });
  it("refuses other schemes", () => {
    for (const s of ["http://cdn.x/a.png", "data:image/png;base64,AAA", "javascript:1"]) expect(() => parseLogo(s), s).toThrow();
  });
});

describe("mergeProfile", () => {
  it("prefers ENS records and marks them verified", () => {
    const p = mergeProfile({ avatar: "https://ens/a.png", url: "https://hoodfi.name", twitter: null }, { logoUrl: "https://seller/b.png", xHandle: "@hoodfi" });
    expect(p.logo).toEqual({ value: "https://ens/a.png", verified: true });
    expect(p.website).toEqual({ value: "https://hoodfi.name/", verified: true });
    expect(p.x).toEqual({ value: "hoodfi", verified: false });
  });
  it("drops invalid values instead of rendering them", () => {
    const p = mergeProfile({ url: "javascript:alert(1)" }, { websiteUrl: "http://insecure.example" });
    expect(p.website).toBeNull();
  });
});
