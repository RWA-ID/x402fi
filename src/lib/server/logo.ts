import "server-only";
import { listingProfile } from "@/lib/server/profile";
import { assertSafeUrl } from "@/lib/ssrf";
import { LOGO_MAX_BYTES } from "@/lib/profile";

/** Identifies the image from its first bytes; the declared content-type is not trusted. */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

type LogoListing = Parameters<typeof listingProfile>[0];

/**
 * A listing's logo, fetched server-side (SSRF-checked, size-capped, sniffed): raster
 * images only. Null when there is none or it cannot be read; never throws.
 */
export async function fetchListingLogo(l: LogoListing): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string } | null> {
  try {
    const profile = await listingProfile(l);
    if (!profile.logo) return null;
    await assertSafeUrl(profile.logo.value);
    const r = await fetch(profile.logo.value, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { accept: "image/png,image/jpeg,image/webp,image/gif" } });
    if (!r.ok || !r.body) return null;
    if (Number(r.headers.get("content-length") ?? "0") > LOGO_MAX_BYTES) return null;
    // Read with a hard cap, whatever content-length claimed.
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LOGO_MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.byteLength; }
    const type = sniffImage(bytes);
    return type ? { bytes, type } : null;
  } catch {
    return null;
  }
}
