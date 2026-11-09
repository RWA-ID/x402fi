import "server-only";
import type { ImageResponse } from "next/og";
import { OG_FONTS, renderListingCard, type CardFont, type ListingCard } from "@/lib/ogcard";
import { getCloudflareContext } from "@opennextjs/cloudflare";


/**
 * Fonts come from our own static assets through the ASSETS binding (a Worker cannot
 * reliably fetch its own hostname), so rendering never depends on Google Fonts. Plain
 * fetch is the fallback for `next dev`, where there is no binding.
 */
async function loadFonts(origin: string): Promise<CardFont[]> {
  let assets: Fetcher | undefined;
  try {
    assets = (getCloudflareContext().env as unknown as { ASSETS?: Fetcher }).ASSETS;
  } catch {
    assets = undefined;
  }
  return Promise.all(
    OG_FONTS.map(async (f) => {
      const url = new URL(`/fonts/${f.file}`, origin);
      const r = assets ? await assets.fetch(url) : await fetch(url);
      if (!r.ok) throw new Error(`font ${f.file}: HTTP ${r.status}`);
      return { name: f.name, data: await r.arrayBuffer(), weight: f.weight, style: f.style };
    }),
  );
}

export async function listingCardImage(card: ListingCard, origin: string): Promise<ImageResponse> {
  return renderListingCard(card, await loadFonts(origin));
}
