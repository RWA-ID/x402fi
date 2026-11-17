import Link from "next/link";
import { REVIEWED_LINE, REVIEWER } from "@/lib/reviews";

/**
 * Home page: the security review program run with HEY Research Lab.
 * Wording and disclaimer approved by HEY (2026-11-17). Never "audited" or "safe"; say
 * "collaboration" or "review program", never "partner", "certified" or "verified by".
 */
export function ReviewProgramCard() {
  const steps = [
    ["Request", "A seller asks for a review when listing, or later from the dashboard. It is free."],
    ["Review", `${REVIEWER.name} reads the endpoint's code at a pinned commit and sends its findings privately.`],
    ["Re-test", "The seller fixes them, HEY re-tests, and signs the result. Only then does the listing show it."],
  ];
  return (
    <section id="security-reviews" className="mx-auto mt-6 max-w-6xl scroll-mt-24 px-4 sm:px-6" aria-labelledby="review-program">
      <div className="rounded-2xl border border-line p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <div>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={REVIEWER.logo} alt={REVIEWER.name} width={64} height={64} className="h-16 w-16 shrink-0 rounded-xl" />
              <div>
                <p className="eyebrow">Security reviews</p>
                <h2 id="review-program" className="display mt-1 text-3xl sm:text-4xl">
                  <a href={REVIEWER.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{REVIEWER.name}</a>
                </h2>
              </div>
            </div>
            <p className="mt-5 text-ink-2">
              Independent code reviews for x402Fi listings, in collaboration with {REVIEWER.name}. A reviewed endpoint carries
              HEY&apos;s signed line on its listing:
            </p>
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-card px-4 py-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={REVIEWER.logo} alt="" width={18} height={18} className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[4px]" />
              <span>{REVIEWED_LINE}</span>
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/sell/new" className="btn btn-primary">Request a free review</Link>
              <Link href="/dashboard" className="btn btn-ghost">From your dashboard</Link>
            </div>
          </div>
          <div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {steps.map(([t, d], i) => (
                <li key={t} className="rounded-xl border border-line p-4">
                  <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
                  <h3 className="display mt-1 text-2xl">{t}</h3>
                  <p className="mt-1.5 text-sm text-ink-2">{d}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-ink-3">
              While a review is under way the listing shows only &ldquo;Review in progress&rdquo;. If the endpoint changes, the review is marked
              out of date; if HEY withdraws it, it comes off the listing.
            </p>
            <p className="mt-4 border-t border-line pt-4 text-xs text-ink-3">
              A review covers the code at the reviewed commit only. It is not a guarantee about the endpoint or its operator, and it is
              not an audit or an endorsement. {REVIEWER.name} can withdraw a review; a withdrawn review no longer shows.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
