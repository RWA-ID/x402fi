import Link from "next/link";
import { formatUsd } from "@/lib/x402/money";
import type { PublicListing } from "@/lib/server/queries";
import type { CardListing } from "@/lib/server/payeeBadges";
import { ListingLogo } from "./ListingLogo";
import { PayeePill } from "./PayeeSeal";

export function ListingCard({ l }: { l: CardListing }) {
  const paidLive = l.services.some((s) => s.status === "live" && s.pricing !== "free");
  return (
    <Link href={`/market/${l.slug}`} className="spot spot-listing group flex min-h-[220px] flex-col rounded-2xl border border-line p-5">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span className="truncate font-mono text-[11px] uppercase tracking-[.16em] text-ink-3">{l.category}</span>
        {/* "Verified" only when the onchain payee check passed (withPayeeBadges); else "Named". */}
        {l.identityName && <PayeePill verified={l.payeeVerified === true} name={l.identityName} />}
      </div>
      <div className="mt-4 flex items-center gap-3">
        {l.logoUrl || l.identityName ? (
          <ListingLogo slug={l.slug} name={l.name} size={40} className="!rounded-[11px] transition-colors duration-[250ms] group-hover:bg-chip group-hover:text-chip-ink" />
        ) : (
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-card font-serif text-[21px] text-ink-2 transition-colors duration-[250ms] group-hover:bg-chip group-hover:text-chip-ink">
            {l.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[17px] font-medium leading-[1.25]">{l.name}</h3>
          <div className="mt-[3px] truncate font-mono text-xs text-ink-3">{l.identityName ?? `${l.payTo.slice(0, 6)}…${l.payTo.slice(-4)}`}</div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-[1.5] text-ink-2">{l.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <PriceSummary l={l} />
        <span className="relative shrink-0">
          {paidLive && <span className="font-mono text-xs text-ink-3 transition-opacity group-hover:opacity-0">{l.calls.toLocaleString()} paid calls</span>}
          <span className="pointer-events-none absolute right-0 top-1/2 inline-flex translate-y-[calc(-50%+6px)] items-center gap-1.5 whitespace-nowrap rounded-lg bg-chip px-3 py-1.5 text-[13px] font-medium text-chip-ink opacity-0 transition-[opacity,transform] duration-200 group-hover:-translate-y-1/2 group-hover:opacity-100">
            View API <span aria-hidden>→</span>
          </span>
        </span>
      </div>
    </Link>
  );
}

function UsdgToken({ size = 24 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/usdg-token.png" alt="USDG" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
}

/** USDG token + "0.01 / call", "From 0.01", "Free", "Priced per request". */
export function PriceSummary({ l }: { l: PublicListing }) {
  const live = l.services.filter((s) => s.status === "live");
  const paidCount = live.filter((s) => s.pricing !== "free").length;
  if (l.fromAtomic) {
    const single = paidCount === 1 && !l.hasQuote;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {!single && <span className="text-sm text-ink-3">From</span>}
        <UsdgToken />
        <span className="font-serif text-[30px] leading-none">{formatUsd(l.fromAtomic).replace(/^\$/, "")}</span>
        <span className="text-sm text-ink-3">/ call</span>
        {l.hasFree && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">+ free</span>}
      </div>
    );
  }
  if (l.hasQuote) return <div className="display text-2xl">Priced per request</div>;
  return <div className="display text-3xl">Free</div>;
}
