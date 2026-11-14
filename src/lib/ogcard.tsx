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

const C = { bg: "#f3f1ec", ink: "#141814", ink2: "#4a524a", ink3: "#6f756c", line: "#dcd7ca", forest: "#283a2a", forestInk: "#f3f1ec", sand: "#ede3c8", accent: "#2f6b3a", verifiedInk: "#24502c", pill: "#f6f4ef" };

/** Brand images as data: URLs (PNG), loaded by the caller from public/. */
export interface CardBrand {
  /** USDG "G" token, square. */
  usdgToken: string;
  /** Global Dollar USDG horizontal brandmark, 2000x660. */
  usdgBrandmark: string;
  /** Robinhood Chain wordmark (black), 1400x184. */
  robinhoodChain: string;
}
export const BRAND_FILES = { usdgToken: "usdg-token.png", usdgBrandmark: "usdg-brandmark.png", robinhoodChain: "robinhood-chain.png" } as const;
const RH_RATIO = 1400 / 184;
const USDG_MARK_RATIO = 2000 / 660;

/**
 * The hero's dot grid, faded toward the edges. Satori ignores repeating background
 * gradients, so the grid is an SVG pattern (resvg draws patterns and masks) in an <img>.
 */
function dotsSvg(cx: number, cy: number, rx: number, ry: number) {
  const { width: w, height: h } = OG_SIZE;
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<defs><pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.7" fill="${C.line}"/></pattern>` +
        `<radialGradient id="g" cx="${cx}" cy="${cy}" r="1" gradientUnits="objectBoundingBox" gradientTransform="translate(${cx} ${cy}) scale(${rx} ${ry}) translate(${-cx} ${-cy})">` +
        `<stop offset="0.2" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>` +
        `<mask id="m"><rect width="${w}" height="${h}" fill="url(#g)"/></mask></defs>` +
        `<rect width="${w}" height="${h}" fill="url(#p)" mask="url(#m)"/></svg>`,
    )
  );
}
function Dots({ cy = 0.45 }: { cy?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dotsSvg(0.5, cy, 0.68, 0.72)} width={OG_SIZE.width} height={OG_SIZE.height} style={{ position: "absolute", left: 0, top: 0 }} alt="" />;
}

function LogoMark({ size = 48 }: { size?: number }) {
  // The site's LogoMark: a payment gate with a coin slot.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill={C.forest} />
      <path d="M8 24V11.5a3.5 3.5 0 0 1 3.5-3.5h9A3.5 3.5 0 0 1 24 11.5V24" stroke={C.forestInk} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <rect x="13" y="13" width="6" height="2.6" rx="1.3" fill={C.forestInk} />
      <circle cx="16" cy="20.5" r="2.3" fill={C.forestInk} />
    </svg>
  );
}

function Wordmark({ size = 44 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.32) }}>
      <LogoMark size={Math.round(size * 1.1)} />
      <div style={{ display: "flex", fontFamily: "Instrument Serif", fontSize: size, letterSpacing: -1 }}>
        x402<span style={{ fontStyle: "italic" }}>Fi</span>
      </div>
    </div>
  );
}

/** Same 12-point seal as the site's PayeeSeal. */
const SEAL = (() => {
  const n = 12, p: string[] = [];
  for (let k = 0; k < n * 2; k++) {
    const a = (Math.PI * k) / n - Math.PI / 2, r = k % 2 ? 8.1 : 9.5;
    p.push(`${(10 + r * Math.cos(a)).toFixed(2)},${(10 + r * Math.sin(a)).toFixed(2)}`);
  }
  return "M" + p.join("L") + "Z";
})();
function Seal({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d={SEAL} fill={C.accent} stroke={C.accent} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.3 10.3l2.5 2.4 4.9-5.1" fill="none" stroke={C.forestInk} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  /** The listing's own logo as a data: URL (PNG/JPEG/GIF), shown beside its name. */
  logo?: string | null;
  /** True only when the onchain payee check passed when the card was drawn. */
  payeeVerified?: boolean;
}

export type CardFont = { name: string; data: ArrayBuffer; weight: 400 | 500; style: "normal" | "italic" };

/** Pure: card data + fonts + brand images in, PNG response out. */
export function renderListingCard(card: ListingCard, fonts: CardFont[], brand: CardBrand): ImageResponse {
  const name = clip(card.name, 60);
  const twoLines = name.length > 34;
  const nameSize = twoLines ? 72 : name.length > 20 ? 92 : 112;
  // "$0.01" is drawn as the USDG token + "0.01"; "Free" stays a word.
  const usd = card.price?.startsWith("$") ? card.price.slice(1) : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.ink, fontFamily: "Inter", padding: "56px 72px", position: "relative" }}>
        <Dots cy={0.4} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark size={44} />
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 20, letterSpacing: 3, color: C.ink3, textTransform: "uppercase" }}>{clip(card.category, 28)}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", paddingBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {card.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
              <img src={card.logo} width={twoLines ? 104 : 128} height={twoLines ? 104 : 128} style={{ borderRadius: 26, objectFit: "cover", flexShrink: 0 }} alt="" />
            )}
            <div style={{ display: "flex", fontFamily: "Instrument Serif", fontSize: nameSize, lineHeight: 1, letterSpacing: -2, flexShrink: 1 }}>{name}</div>
          </div>
          <div style={{ marginTop: twoLines ? 20 : 26, fontSize: twoLines ? 28 : 32, lineHeight: 1.3, color: C.ink2, maxWidth: 1000 }}>{clip(card.summary, twoLines ? 110 : 140)}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: `2px solid ${C.line}`, paddingTop: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 1, paddingRight: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, color: C.ink2 }}>
              {/* "… · USDG on Robinhood Chain": the chain's own wordmark finishes the line. */}
              <span>{card.tagline.replace(/\s*Robinhood Chain$/, "")}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.robinhoodChain} width={Math.round(22 * RH_RATIO)} height={22} alt="" />
            </div>
            {card.payeeName ? (
              card.payeeVerified ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 16px 5px 6px", borderRadius: 999, background: "rgba(47,107,58,0.13)", border: "1.5px solid rgba(47,107,58,0.28)", color: C.verifiedInk, fontSize: 20, fontWeight: 500 }}>
                    <Seal size={26} />
                    Verified payee
                  </div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, color: C.ink3 }}>{clip(card.payeeName, 36)}</div>
                </div>
              ) : (
                <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, color: C.ink3 }}>{`paid to ${clip(card.payeeName, 44)}`}</div>
              )
            ) : (
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, color: C.ink3 }}>x402fi.dev</div>
            )}
          </div>
          {card.price && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, background: C.forest, color: C.forestInk, borderRadius: 18, padding: "16px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {usd && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.usdgToken} width={46} height={46} alt="" />
                )}
                <div style={{ fontFamily: "Instrument Serif", fontSize: 60, lineHeight: 1 }}>{usd ?? card.price}</div>
                {usd && <div style={{ fontFamily: "JetBrains Mono", fontSize: 18, color: C.sand, alignSelf: "flex-end", marginBottom: 6 }}>USDG</div>}
              </div>
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

/** The site's own share card: the homepage hero. */
export function renderSiteCard(fonts: CardFont[], brand: CardBrand): ImageResponse {
  const h1 = 104;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: C.bg, color: C.ink, fontFamily: "Inter", position: "relative", padding: "44px 64px 48px" }}>
        <Dots />
        <div style={{ display: "flex", width: "100%", justifyContent: "flex-start" }}>
          <Wordmark size={38} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1, justifyContent: "center", marginTop: -8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: "JetBrains Mono", fontSize: 18, letterSpacing: 3.6, color: C.ink3, textTransform: "uppercase" }}>x402 payments on</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.robinhoodChain} width={Math.round(28 * RH_RATIO)} height={28} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 30, fontFamily: "Instrument Serif", fontSize: h1, lineHeight: 1.06, letterSpacing: -3 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span>Let AI agents</span>
              <span style={{ marginLeft: 26, background: C.forest, color: C.forestInk, borderRadius: 12, padding: "0 14px 8px", lineHeight: 0.98 }}>pay you</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
              <span>per request,</span>
              <span style={{ fontStyle: "italic", marginLeft: 24 }}>in</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.usdgBrandmark} width={Math.round(h1 * 0.92 * USDG_MARK_RATIO)} height={Math.round(h1 * 0.92)} style={{ marginLeft: 22, marginTop: 6 }} alt="" />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 22, color: C.ink3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 20px 9px 18px", borderRadius: 999, background: C.pill, border: `1.5px solid ${C.line}` }}>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 15, letterSpacing: 2.2, textTransform: "uppercase" }}>Settles in</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.usdgBrandmark} width={Math.round(30 * USDG_MARK_RATIO)} height={30} alt="" />
          </div>
          <span>No code</span><span>·</span><span>Free to list</span><span>·</span><span>0% taken from payments</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } },
  );
}
