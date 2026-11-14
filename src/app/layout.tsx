import type { Metadata } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SpotlightCards } from "@/components/SpotlightCards";
import { wagmiConfig } from "@/lib/client/wagmi";
import { SITE_URL, X_HANDLE } from "@/lib/share";

const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
/** Bump ?v= when the hero card changes: X caches a card by its URL for days. */
const SITE_CARD = { url: "/og/site?v=1", width: 1200, height: 630, alt: "x402Fi: let AI agents pay you per request, in USDG" };

const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

export const metadata: Metadata = {
  title: { default: "x402Fi: get paid by AI agents", template: "%s · x402Fi" },
  description: "Turn any API into a paid service for AI agents. Per-call payments in USDG on Robinhood Chain, with verified payees and audit-ready receipts. Listing is free.",
  icons: { icon: "/icon.svg" },
  // Lets pages write og:image / canonical as paths and still emit absolute URLs.
  metadataBase: new URL(SITE_URL),
  // The homepage hero as the default share card. Pages that set openGraph/twitter (listings) restate their own.
  openGraph: {
    type: "website",
    siteName: "x402Fi",
    title: "x402Fi: get paid by AI agents",
    description: "Let AI agents pay you per request, in USDG on Robinhood Chain. Listing is free.",
    images: [SITE_CARD],
  },
  twitter: { card: "summary_large_image", site: `@${X_HANDLE}`, images: [SITE_CARD] },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = cookieToInitialState(wagmiConfig, (await headers()).get("cookie"));
  return (
    // Font variables live on <html> so :root tokens can reference them.
    <html lang="en" className={`${display.variable} ${body.variable} ${code.variable}`}>
      <body className="min-h-dvh">
        <Providers initialState={initialState}>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
        <SpotlightCards />
      </body>
    </html>
  );
}
