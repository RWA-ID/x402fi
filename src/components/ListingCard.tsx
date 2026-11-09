import Link from "next/link";
import { formatUsd } from "@/lib/x402/money";
import type { PublicListing } from "@/lib/server/queries";
import { ListingLogo } from "./ListingLogo";

export function ListingCard({ l }: { l: PublicListing }) {
  return (
    <Link href={`/market/${l.slug}`} className="card group flex flex-col p-5 transition-colors hover:border-ink-3">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow truncate">{l.category}</span>
        {l.identityName && <PayeeChip name={l.identityName} />}
      </div>
      <div className="mt-3 flex items-center gap-3">
        {(l.logoUrl || l.identityName) && <ListingLogo slug={l.slug} name={l.name} size={36} />}
        <h3 className="text-lg font-medium leading-snug group-hover:underline">{l.name}</h3>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-ink-2">{l.summary}</p>
      <div className="mt-auto flex items-end justify-between pt-5">
        <PriceSummary l={l} />
        {l.services.some((s) => s.status === "live" && s.pricing !== "free") && (
          <span className="font-mono text-xs text-ink-3">{l.calls.toLocaleString()} paid calls</span>
        )}
      </div>
    </Link>
  );
}

/** "$0.01 / call", "From $0.01", "Free", "Priced per request". */
export function PriceSummary({ l }: { l: PublicListing }) {
  const live = l.services.filter((s) => s.status === "live");
  const paidCount = live.filter((s) => s.pricing !== "free").length;
  if (l.fromAtomic) {
    const single = paidCount === 1 && !l.hasQuote;
    return (
      <div>
        {!single && <span className="mr-1 text-sm text-ink-3">From</span>}
        <span className="display text-3xl">{formatUsd(l.fromAtomic)}</span>
        <span className="ml-1 text-sm text-ink-3">/ call</span>
        {l.hasFree && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">+ free</span>}
      </div>
    );
  }
  if (l.hasQuote) return <div className="display text-2xl">Priced per request</div>;
  return <div className="display text-3xl">Free</div>;
}

export function PayeeChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-[60%] items-center gap-1 truncate rounded-full border border-line px-2 py-0.5 text-xs text-ink-2" title={`Payee named ${name}`}>
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="truncate">{name}</span>
    </span>
  );
}
