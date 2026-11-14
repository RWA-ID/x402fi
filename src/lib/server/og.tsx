import "server-only";
import type { ImageResponse } from "next/og";
import { BRAND_FILES, OG_FONTS, renderListingCard, renderSiteCard, type CardBrand, type CardFont, type ListingCard } from "@/lib/ogcard";
import { getCloudflareContext } from "@opennextjs/cloudflare";


/**
 * Fonts come from our own static assets through the ASSETS binding (a Worker cannot
 * reliably fetch its own hostname), so rendering never depends on Google Fonts. Plain
 * fetch is the fallback for `next dev`, where there is no binding.
 */
function assetsBinding(): Fetcher | undefined {
  try {
    return (getCloudflareContext().env as unknown as { ASSETS?: Fetcher }).ASSETS;
  } catch {
    return undefined;
  }
}

/** A file from public/, via the ASSETS binding (or plain fetch under `next dev`). No Accept header: never WebP. */
async function asset(origin: string, path: string): Promise<Response> {
  const url = new URL(path, origin);
  const assets = assetsBinding();
  let r = assets ? await assets.fetch(url) : await fetch(url);
  // Under `next dev` the binding serves the LAST build's .open-next/assets, which lacks files added since.
  if (!r.ok && assets) r = await fetch(url);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r;
}

async function loadFonts(origin: string): Promise<CardFont[]> {
  return Promise.all(
    OG_FONTS.map(async (f) => ({ name: f.name, data: await (await asset(origin, `/fonts/${f.file}`)).arrayBuffer(), weight: f.weight, style: f.style })),
  );
}

/** The USDG and Robinhood Chain marks, unchanged, as PNG data: URLs. */
async function loadBrand(origin: string): Promise<CardBrand> {
  const entries = await Promise.all(
    Object.entries(BRAND_FILES).map(async ([k, f]) => [k, `data:image/png;base64,${Buffer.from(await (await asset(origin, `/${f}`)).arrayBuffer()).toString("base64")}`] as const),
  );
  return Object.fromEntries(entries) as unknown as CardBrand;
}

export async function listingCardImage(card: ListingCard, origin: string): Promise<ImageResponse> {
  const [fonts, brand] = await Promise.all([loadFonts(origin), loadBrand(origin)]);
  return renderListingCard(card, fonts, brand);
}

export async function siteCardImage(origin: string): Promise<ImageResponse> {
  const [fonts, brand] = await Promise.all([loadFonts(origin), loadBrand(origin)]);
  return renderSiteCard(fonts, brand);
}
