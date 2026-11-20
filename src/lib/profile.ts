/**
 * Seller profile fields: parsing and validation shared by the API, the ENS
 * reader and the UI. Everything that reaches a link or an image tag passes here.
 */

export class ProfileInputError extends Error {}

/** "@hoodfi", "hoodfi", "https://x.com/hoodfi", "twitter.com/hoodfi/" → "hoodfi". */
export function parseXHandle(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  let h = s;
  const m = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/(@?[A-Za-z0-9_]+)\/?(?:\?.*)?$/i.exec(s);
  if (m) h = m[1];
  else if (/[/.:]/.test(s)) throw new ProfileInputError("Use an X handle like @yourco or an x.com/yourco link.");
  h = h.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) throw new ProfileInputError("X handles are 1 to 15 letters, numbers or underscores.");
  if (/^(home|explore|i|search|settings|intent|share)$/i.test(h)) throw new ProfileInputError("That is not a profile handle.");
  return h;
}

/** A public https URL with no credentials, or null when empty. Normalizes a bare domain to https. */
export function parseWebsite(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    throw new ProfileInputError("That is not a valid website address.");
  }
  if (u.protocol !== "https:") throw new ProfileInputError("Use an https:// website.");
  if (u.username || u.password) throw new ProfileInputError("Remove the username/password from the link.");
  if (!u.hostname.includes(".") || u.hostname.endsWith(".")) throw new ProfileInputError("Use a public website address.");
  if (s.length > 200) throw new ProfileInputError("Keep the link under 200 characters.");
  return u.toString();
}

/** Logo source: https:// or ipfs://; returned as an https URL the server may fetch. */
export function parseLogo(input: string | null | undefined, ipfsGateway = "https://ipfs.io"): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const ipfs = /^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]+(?:\/[^\s?#]*)?)$/.exec(s);
  if (ipfs) return `${ipfsGateway}/ipfs/${ipfs[1]}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new ProfileInputError("Use an https:// or ipfs:// image link.");
  }
  if (u.protocol !== "https:") throw new ProfileInputError("Use an https:// or ipfs:// image link.");
  if (u.username || u.password) throw new ProfileInputError("Remove the username/password from the link.");
  if (s.length > 500) throw new ProfileInputError("Keep the link under 500 characters.");
  return u.toString();
}

/**
 * The profile fields a publish call may carry (logo, website, X), parsed as PATCH parses them.
 * Field → message on bad input, so a 422 says which one. The logo is stored as entered
 * (validated); parseLogo maps ipfs:// at display time.
 */
export function parseProfileFields(i: { logoUrl?: string | null; websiteUrl?: string | null; xHandle?: string | null }):
  | { ok: true; value: { logoUrl: string | null; websiteUrl: string | null; xHandle: string | null } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const one = <T,>(field: string, f: () => T): T | null => {
    try { return f(); } catch (e) { if (e instanceof ProfileInputError) { errors[field] = e.message; return null; } throw e; }
  };
  const value = {
    logoUrl: one("logoUrl", () => (parseLogo(i.logoUrl) ? (i.logoUrl ?? "").trim() : null)),
    websiteUrl: one("websiteUrl", () => parseWebsite(i.websiteUrl)),
    xHandle: one("xHandle", () => parseXHandle(i.xHandle)),
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/**
 * Gateways tried in order for an ipfs:// logo. One public gateway is not enough:
 * ipfs.io answered 429 for a HoodFi avatar on 2026-11-15, so the logo vanished.
 * Our own gateway holds HoodFi pins but refuses CIDs it did not pin, hence a chain.
 */
export const IPFS_GATEWAYS = ["https://ipfs.onchain-id.id", "https://gateway.pinata.cloud", "https://ipfs.io", "https://dweb.link"];

/** Every URL worth trying for a logo: an IPFS link expands to each gateway, anything else is itself. */
export function logoCandidates(url: string): string[] {
  const m = /^https:\/\/ipfs\.io\/ipfs\/(.+)$/.exec(url);
  return m ? IPFS_GATEWAYS.map((g) => `${g}/ipfs/${m[1]}`) : [url];
}

/** Raster images only: an SVG served from our origin could run script. */
export const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const LOGO_MAX_BYTES = 1_000_000;

export interface ProfileField<T> {
  value: T;
  /** true: read from the payee name's ENS records, which only its owner can set. */
  verified: boolean;
}

export interface Profile {
  logo: ProfileField<string> | null;
  website: ProfileField<string> | null;
  x: ProfileField<string> | null;
}

/** ENS-sourced values win; seller-entered ones fill the gaps. Invalid values are dropped. */
export function mergeProfile(
  ens: { avatar?: string | null; url?: string | null; twitter?: string | null } | null,
  manual: { logoUrl?: string | null; websiteUrl?: string | null; xHandle?: string | null },
): Profile {
  const safe = <T>(f: () => T | null): T | null => {
    try {
      return f();
    } catch {
      return null;
    }
  };
  const pick = (fromEns: string | null, fromSeller: string | null): ProfileField<string> | null =>
    fromEns ? { value: fromEns, verified: true } : fromSeller ? { value: fromSeller, verified: false } : null;
  return {
    logo: pick(safe(() => parseLogo(ens?.avatar)), safe(() => parseLogo(manual.logoUrl))),
    website: pick(safe(() => parseWebsite(ens?.url)), safe(() => parseWebsite(manual.websiteUrl))),
    x: pick(safe(() => parseXHandle(ens?.twitter)), safe(() => parseXHandle(manual.xHandle))),
  };
}
