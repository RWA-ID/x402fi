import { eq } from "drizzle-orm";
import { listings } from "@/db/schema";
import { db, envAsync } from "@/lib/server/env";
import { listingProfile } from "@/lib/server/profile";
import { assertSafeUrl } from "@/lib/ssrf";
import { LOGO_MAX_BYTES } from "@/lib/profile";

/** Identifies the image from its first bytes; the declared content-type is not trusted. */
function sniff(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

const none = () => new Response(null, { status: 404, headers: { "cache-control": "public, max-age=300" } });

/**
 * A listing's logo, fetched server-side so viewers' browsers never contact the
 * seller's host (no tracking pixels) and only raster images are ever served.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = await db(await envAsync()).query.listings.findFirst({ where: eq(listings.slug, slug) });
  if (!l || l.status === "draft") return none();
  const profile = await listingProfile(l);
  if (!profile.logo) return none();
  try {
    await assertSafeUrl(profile.logo.value);
    const r = await fetch(profile.logo.value, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { accept: "image/png,image/jpeg,image/webp,image/gif" } });
    if (!r.ok || !r.body) return none();
    const declared = Number(r.headers.get("content-length") ?? "0");
    if (declared > LOGO_MAX_BYTES) return none();
    // Read with a hard cap, whatever content-length claimed.
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LOGO_MAX_BYTES) { await reader.cancel(); return none(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.byteLength; }
    const type = sniff(bytes);
    if (!type) return none();
    return new Response(bytes, {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return none();
  }
}
