import type { Metadata } from "next";
import { parseExample } from "@/lib/x402/bazaar";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { listingBySlug, nativeBaseUrl, type PublicService } from "@/lib/server/queries";
import { nativeUrl, probeNative } from "@/lib/server/native";
import { priorsRecord } from "@/lib/server/priors";
import { PriorsBadge } from "@/components/PriorsBadge";
import { payeeStatus } from "@/lib/server/payee";
import { formatUsd } from "@/lib/x402/money";
import { priceLabel } from "@/lib/gateway/services";
import { addressUrl } from "@/lib/chains";
import { PayeeBadge } from "@/components/PayeeBadge";
import { TryIt } from "./TryIt";
import { listingProfile } from "@/lib/server/profile";
import { ListingLogo } from "@/components/ListingLogo";
import { parseContractConfig } from "@/lib/x402/contract";
import { ShareOnX } from "@/components/ShareOnX";
import { SITE_URL, X_HANDLE, cardVersion, sharePrice, shareText, xIntentUrl } from "@/lib/share";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const l = await listingBySlug((await params).slug).catch(() => null);
  if (!l || l.status === "draft") return { title: "Not found" };
  // openGraph and twitter REPLACE the root layout's, they do not merge: restate everything.
  const path = `/market/${l.slug}`;
  // X caches a card by its URL for days: the URL changes whenever what the card shows does.
  const image = { url: `/og/listing/${l.slug}?v=${cardVersion(l)}`, width: 1200, height: 630, alt: `${l.name} on x402Fi` };
  const title = `${l.name} · x402Fi`;
  return {
    title: l.name,
    description: l.summary,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "x402Fi", url: path, title, description: l.summary, images: [image] },
    twitter: { card: "summary_large_image", site: `@${X_HANDLE}`, title, description: l.summary, images: [image] },
  };
}

/**
 * Example URL for an endpoint: its path plus the example ("/0x…/names" or "?q=1").
 * Parsed like the Bazaar feed, so a bare "token=0x…" is a query, not a path segment.
 */
function examplePath(s: PublicService) {
  const base = s.path === "/" ? "" : s.path;
  const { subPath, query } = parseExample(s.path, s.exampleRequest);
  const q = new URLSearchParams(query).toString();
  return base + subPath + (q ? `?${q}` : "");
}

export default async function ListingPage({ params }: P) {
  const { slug } = await params;
  const l = await listingBySlug(slug);
  if (!l || l.status === "draft") notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const gateway = `${origin}/g/${l.slug}`;
  const live = l.services.filter((s) => s.status === "live");
  // Native endpoints: the seller's own x402 URL, probed for its live price and payTo.
  const base = await nativeBaseUrl(l);
  const natives = base ? live.filter((s) => s.pricing === "native") : [];
  const probes = new Map(
    await Promise.all(natives.map(async (s) => {
      const url = nativeUrl(base!, s.path, s.exampleRequest);
      return [s.id, { url, probe: await probeNative(url, s.method, s.exampleBody) }] as const;
    })),
  );
  const allNative = live.length > 0 && natives.length === live.length;
  // Buyers of a native listing contact the seller's own origin, so that is what its payee name must list.
  const payeeOrigin = base && allNative ? new URL(base).origin : origin;
  const [payee, profile, priors] = await Promise.all([
    payeeStatus({ identityName: l.identityName, payTo: l.payTo, origin: payeeOrigin, slug: l.slug }),
    listingProfile(l),
    priorsRecord(l.payTo),
  ]);
  const shareUrl = `${SITE_URL}/market/${l.slug}`;
  const post = shareText(l, sharePrice(l.services), profile.x?.value);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <Link href="/market" className="text-sm text-ink-3 hover:text-ink">← Marketplace</Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <p className="eyebrow">{l.category}</p>
          <div className="mt-3 flex items-center gap-4">
            {profile.logo && <ListingLogo slug={l.slug} name={l.name} size={64} />}
            <h1 className="display text-5xl sm:text-6xl">{l.name}</h1>
          </div>
          <p className="mt-4 text-lg text-ink-2">{l.summary}</p>
          {(profile.website || profile.x) && (
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {profile.website && (
                <ProfileLink icon="web" href={profile.website.value} verified={profile.website.verified} label={new URL(profile.website.value).hostname.replace(/^www\./, "")} />
              )}
              {profile.x && <ProfileLink icon="x" href={`https://x.com/${profile.x.value}`} verified={profile.x.verified} label={`@${profile.x.value}`} />}
            </div>
          )}
          {l.status === "paused" && <p className="mt-4 rounded-lg bg-card p-3 text-sm text-warn">Paused by its owner. Calls are not accepted right now.</p>}
          {l.description && <div className="mt-8 whitespace-pre-line leading-relaxed text-ink-2">{l.description}</div>}

          <h2 className="eyebrow mt-10">{live.length === 1 ? "Endpoint" : `${live.length} endpoints`}</h2>
          <div className="mt-3 space-y-3">
            {live.map((s) => {
              const ex = examplePath(s);
              const nat = probes.get(s.id);
              if (s.pricing === "native" && nat) return <NativeEndpoint key={s.id} s={s} url={nat.url} probe={nat.probe} />;
              return (
                <section key={s.id} className="card overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto] items-start gap-4 p-5">
                    <div className="min-w-0">
                      <h3 className="font-medium">{s.name}</h3>
                      {s.summary && <p className="mt-1 text-sm text-ink-2">{s.summary}</p>}
                      <p className="mt-2 break-all font-mono text-xs text-ink-3">
                        <span className="mr-2 rounded bg-card px-1.5 py-0.5 text-ink-2">{s.method}</span>
                        /g/{l.slug}{s.path === "/" ? "" : s.path}{s.path === "/" ? "/…" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="display text-3xl">{priceLabel(s, formatUsd)}</div>
                      <div className="text-xs text-ink-3">{s.pricing === "free" ? "no payment" : s.pricing === "quote" ? "exact price quoted per request" : s.pricing === "contract" ? "exact price by name, paid on-chain" : "per call"}</div>
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap break-all bg-forest px-5 py-4 font-mono text-[0.78rem] leading-relaxed text-forest-ink">{`${s.method} ${gateway}${ex}`}{s.pricing !== "free" ? `

# 402 Payment Required → sign USDG → retry with PAYMENT-SIGNATURE` : ""}</pre>
                  {s.exampleResponse && (
                    <details className="border-t border-line px-5 py-3 text-sm">
                      <summary className="cursor-pointer text-ink-2">Example response</summary>
                      <pre className="mt-2 overflow-x-auto font-mono text-[0.75rem]">{s.exampleResponse}</pre>
                    </details>
                  )}
                  {l.status === "live" && s.pricing !== "native" && (
                    <div className="border-t border-line px-5 py-4">
                      <TryIt
                        slug={l.slug}
                        method={s.method}
                        pathAndQuery={s.pricing === "contract" ? (s.path === "/" ? "" : s.path) : ex}
                        pricing={s.pricing}
                        priceLabel={priceLabel(s, formatUsd)}
                        nameEntry={s.pricing === "contract" ? { suffix: parseContractConfig(s.contractConfig)?.labelSuffix } : undefined}
                      />
                    </div>
                  )}
                </section>
              );
            })}
            {!live.length && <div className="card p-6 text-sm text-ink-3">No endpoints are live right now.</div>}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-6">
            <div className="eyebrow">Paid to</div>
            <dl className="mt-3 divide-y divide-line text-sm">
              <Row k="Currency" v="USDG (Paxos), on Robinhood Chain" />
              <Row k="Payout wallet" v={<a className="font-mono underline-offset-2 hover:underline" href={addressUrl(l.payTo)} target="_blank" rel="noreferrer">{l.payTo.slice(0, 6)}…{l.payTo.slice(-4)}</a>} />
              {live.some((s) => s.pricing !== "free" && s.pricing !== "native") && <Row k="Paid calls" v={l.calls.toLocaleString()} />}
              <Row k="Endpoints" v={`${live.length} live${l.hasFree ? ", incl. free" : ""}`} />
              {l.dailyCapAtomic && <Row k="Daily limit" v={formatUsd(l.dailyCapAtomic)} />}
            </dl>
            <p className="mt-4 text-xs text-ink-3">
              {allNative
                ? "Paid directly to the seller over x402: x402Fi lists this service but never handles its payments."
                : "Buyers pay no gas, and are only charged when the service answers successfully."}
            </p>
          </div>
          <PayeeBadge status={payee} />
          <PriorsBadge record={priors} />
          {l.status === "live" && <ShareOnX text={post} url={shareUrl} intent={xIntentUrl(post, shareUrl)} />}
        </aside>
      </div>
    </div>
  );
}

/**
 * A profile link. "verified" = read from the payee name's ENS records; otherwise
 * entered by the seller. rel="nofollow ugc" because sellers supply the target.
 */
function ProfileLink({ href, label, verified, icon }: { href: string; label: string; verified: boolean; icon: "web" | "x" }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      title={verified ? "Set on the payee name's ENS records" : "Provided by the seller"}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-ink-2 hover:border-ink-3 hover:text-ink"
    >
      {icon === "x" ? (
        // The X logo mark.
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-label="X">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="Website">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
      )}
      {label}
      {verified ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-good" fill="none" stroke="currentColor" strokeWidth="2" aria-label="verified">
          <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="text-xs text-ink-3">· by seller</span>
      )}
    </a>
  );
}

/** A native endpoint: the seller's own x402 URL, paid directly; price and payee read from its 402. */
function NativeEndpoint({ s, url, probe }: { s: PublicService; url: string; probe: Awaited<ReturnType<typeof probeNative>> }) {
  const curl = s.method === "GET"
    ? `curl -i "${url}"`
    : `curl -i -X ${s.method} "${url}" \\\n  -H 'content-type: application/json' \\\n  -d '${(s.exampleBody ?? "{}").replace(/'/g, "'\\''")}'`;
  return (
    <section className="card overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] items-start gap-4 p-5">
        <div className="min-w-0">
          <h3 className="font-medium">{s.name}</h3>
          {(s.summary || (probe.ok && probe.quote.description)) && <p className="mt-1 text-sm text-ink-2">{s.summary || (probe.ok ? probe.quote.description : "")}</p>}
          <p className="mt-2 break-all font-mono text-xs text-ink-3"><span className="mr-2 rounded bg-card px-1.5 py-0.5 text-ink-2">{s.method}</span>{url}</p>
        </div>
        <div className="text-right">
          <div className="display text-3xl">{probe.ok ? formatUsd(probe.quote.amount) : "—"}</div>
          <div className="text-xs text-ink-3">paid directly to the seller</div>
        </div>
      </div>
      <pre className="whitespace-pre-wrap break-all bg-forest px-5 py-4 font-mono text-[0.78rem] leading-relaxed text-forest-ink">{curl}{`

# The seller answers 402 itself: sign USDG and retry with PAYMENT-SIGNATURE`}</pre>
      <div className="border-t border-line px-5 py-3 text-xs text-ink-3">
        {probe.ok ? (
          <>Read live from the seller&apos;s 402: {formatUsd(probe.quote.amount)} USDG on Robinhood Chain to <span className="font-mono">{probe.quote.payTo.slice(0, 6)}…{probe.quote.payTo.slice(-4)}</span>
            {probe.quote.payeeName && <> · payee name <span className="font-mono">{probe.quote.payeeName}</span></>}
            {probe.quote.networks.length > 1 && <> · also accepts {probe.quote.networks.filter((n) => n !== "eip155:4663" && n !== "robinhood").join(", ")}</>}.</>
        ) : (
          <span className="text-warn">Couldn&apos;t read the seller&apos;s price right now ({probe.reason}).</span>
        )}
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
