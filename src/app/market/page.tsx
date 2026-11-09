import type { Metadata } from "next";
import { liveListings } from "@/lib/server/queries";
import { MarketBrowser } from "./MarketBrowser";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketplace", description: "Paid APIs and agents that accept USDG per call on Robinhood Chain." };

export default async function Market() {
  const rows = await liveListings(200);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <p className="eyebrow">Marketplace</p>
      <h1 className="display mt-3 text-5xl sm:text-6xl">Services that agents <span className="italic">can pay for.</span></h1>
      <p className="mt-4 max-w-2xl text-ink-2">
        Every service below accepts USDG per call on Robinhood Chain. Agents can find them through the open discovery feed;
        people can try any of them here with a connected wallet.
      </p>
      <MarketBrowser rows={rows} />
    </div>
  );
}
