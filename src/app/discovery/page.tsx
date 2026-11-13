import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { discoveryFeed, MAX_LIMIT } from "@/lib/server/discovery";
import { formatUsd } from "@/lib/x402/money";
import { Copy } from "@/components/Copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discovery feed",
  description: "The machine-readable list of every paid x402 endpoint on x402Fi, for AI agents and indexers.",
};

export default async function Discovery() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const feed = await discoveryFeed(origin, { limit: MAX_LIMIT });
  const feedUrl = `${origin}/api/discovery/resources`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <p className="eyebrow">Open data</p>
      <h1 className="display mt-3 text-5xl sm:text-6xl">Discovery <span className="italic">feed</span></h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">
        AI agents don&apos;t browse a marketplace; they read a feed. Every paid endpoint on x402Fi is published here in the
        Bazaar-style x402 discovery format, so agents and indexers can find a service, see its price and pay it, with no
        sign-up.
      </p>

      <div className="mt-8 max-w-3xl">
        <Copy label="Feed URL (JSON, for agents and indexers)" value={feedUrl} hint="Each item carries the resource URL, the x402 payment requirements (price, USDG, payTo, network), how to call it (the bazaar extension: method, parameters, example output) and the payee name. Filter with type, payTo, network and extensions; page with limit and offset." />
        <a href="/api/discovery/resources" className="btn btn-ghost mt-3">View raw JSON</a>
      </div>

      <h2 className="eyebrow mt-12">{feed.items.length} paid endpoint{feed.items.length === 1 ? "" : "s"} in the feed</h2>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-ink-3">
            <tr className="border-b border-line">
              {["Service", "Endpoint", "Price", "Paid to", "Payee name"].map((c) => <th key={c} className="px-4 py-3 font-normal">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {feed.items.map((i) => {
              const a = i.accepts[0];
              const ceiling = i.metadata.pricing === "quote" || i.metadata.pricing === "contract";
              const path = i.resource.replace(origin, "") + (i.metadata.pricing === "contract" ? "/{name}" : "");
              return (
                <tr key={i.resource} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3">
                    <Link href={i.metadata.listing.replace(origin, "")} className="font-medium hover:underline">{i.metadata.name}</Link>
                    <div className="mt-0.5 text-xs text-ink-3">{i.metadata.category}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs"><span className="mr-1.5 rounded bg-card px-1.5 py-0.5">{i.metadata.method}</span>{path}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{ceiling ? `Up to ${formatUsd(a.amount)}` : formatUsd(a.amount)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.payTo.slice(0, 6)}…{a.payTo.slice(-4)}{i.metadata.pricing === "contract" ? <span className="block font-sans text-ink-3">contract</span> : i.metadata.pricing === "native" ? <span className="block font-sans text-ink-3">paid directly</span> : null}</td>
                  <td className="px-4 py-3 font-mono text-xs">{i.metadata.payeeName ?? "—"}</td>
                </tr>
              );
            })}
            {!feed.items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-3">No paid endpoints yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">Free endpoints are not part of the paid-resource feed; they are listed on each service&apos;s marketplace page.</p>

      <h2 className="display mt-14 text-3xl">Item format</h2>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-forest p-4 font-mono text-[0.75rem] leading-relaxed text-forest-ink">{JSON.stringify(feed.items[0] ?? { resource: "…", accepts: ["…"], metadata: {} }, null, 2)}</pre>
    </div>
  );
}
