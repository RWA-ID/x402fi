import { ImageResponse } from "next/og";

/** Share-card size X and every other unfurler expect. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Card fonts, served from public/fonts. */
export const OG_FONTS = [
  { name: "Instrument Serif", file: "InstrumentSerif-Regular.ttf", weight: 400, style: "normal" },
  { name: "Instrument Serif", file: "InstrumentSerif-Italic.ttf", weight: 400, style: "italic" },
  { name: "Inter", file: "Inter-Regular.ttf", weight: 400, style: "normal" },
  { name: "Inter", file: "Inter-Medium.ttf", weight: 500, style: "normal" },
  { name: "JetBrains Mono", file: "JetBrainsMono-Regular.ttf", weight: 400, style: "normal" },
] as const;

const C = { bg: "#f3f1ec", ink: "#141814", ink2: "#4a524a", ink3: "#7d837a", line: "#dcd7ca", forest: "#283a2a", forestInk: "#f3f1ec", sand: "#ede3c8" };

/** Shortens at a word boundary (when one is near) and marks it with an ellipsis. */
const clip = (s: string, n: number): string => {
  if (n <= 1) return "";
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return (space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "") + "…";
};

export interface ListingCard {
  name: string;
  summary: string;
  category: string;
  /** "$0.01" or "Free"; null hides the price block. */
  price: string | null;
  priceNote: string;
  payeeName: string | null;
  /** Footer line, e.g. "Paid per call by AI agents · USDG on Robinhood Chain". */
  tagline: string;
}

export type CardFont = { name: string; data: ArrayBuffer; weight: 400 | 500; style: "normal" | "italic" };

/** Pure: card data + fonts in, PNG response out. */
export function renderListingCard(card: ListingCard, fonts: CardFont[]): ImageResponse {
  const name = clip(card.name, 60);
  const twoLines = name.length > 34;
  const nameSize = twoLines ? 72 : name.length > 20 ? 92 : 112;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.ink, fontFamily: "Inter", padding: "56px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* The site's LogoMark: a payment gate with a coin slot. */}
            <svg width="48" height="48" viewBox="0 0 32 32">
              <rect width="32" height="32" rx="7" fill={C.forest} />
              <path d="M8 24V11.5a3.5 3.5 0 0 1 3.5-3.5h9A3.5 3.5 0 0 1 24 11.5V24" stroke={C.forestInk} strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <rect x="13" y="13" width="6" height="2.6" rx="1.3" fill={C.forestInk} />
              <circle cx="16" cy="20.5" r="2.3" fill={C.forestInk} />
            </svg>
            <div style={{ display: "flex", fontFamily: "Instrument Serif", fontSize: 44, letterSpacing: -1 }}>
              x402<span style={{ fontStyle: "italic" }}>Fi</span>
            </div>
          </div>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 20, letterSpacing: 3, color: C.ink3, textTransform: "uppercase" }}>{clip(card.category, 28)}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", paddingBottom: 28 }}>
          <div style={{ fontFamily: "Instrument Serif", fontSize: nameSize, lineHeight: 1, letterSpacing: -2 }}>{name}</div>
          <div style={{ marginTop: twoLines ? 20 : 26, fontSize: twoLines ? 28 : 32, lineHeight: 1.3, color: C.ink2, maxWidth: 1000 }}>{clip(card.summary, twoLines ? 110 : 140)}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: `2px solid ${C.line}`, paddingTop: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 1, paddingRight: 24 }}>
            <div style={{ fontSize: 24, color: C.ink2 }}>{card.tagline}</div>
            {card.payeeName ? (
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, color: C.ink3 }}>{`paid to ${clip(card.payeeName, 44)}`}</div>
            ) : (
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, color: C.ink3 }}>x402fi.dev</div>
            )}
          </div>
          {card.price && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, background: C.forest, color: C.forestInk, borderRadius: 16, padding: "14px 26px" }}>
              <div style={{ fontFamily: "Instrument Serif", fontSize: 56, lineHeight: 1 }}>{card.price}</div>
              <div style={{ fontSize: 18, marginTop: 6, color: C.sand }}>{card.priceNote}</div>
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
      // Unfurlers cache by URL anyway; an hour keeps edits showing up the same day.
      headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
    },
  );
}
