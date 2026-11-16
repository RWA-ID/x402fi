import { REVIEWED_LINE, REVIEWER, type PublicReview } from "@/lib/reviews";

function Logo({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={REVIEWER.logo} alt="" width={size} height={size} className="shrink-0 rounded-[5px]" style={{ width: size, height: size }} />;
}

const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * An endpoint's HEY Research Lab review, on the endpoint card next to Try it.
 * "in_progress" covers requested / findings sent / fixes submitted alike, by design.
 * Wording is HEY's: never "audited" or "safe".
 */
export function ReviewBadge({ review, serviceId }: { review: PublicReview; serviceId: string }) {
  const by = <a href={REVIEWER.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{REVIEWER.name}</a>;
  if (review.status === "in_progress") {
    return (
      <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-sm text-ink-2">
        <Logo size={18} />
        <span>Review in progress · {by}</span>
      </div>
    );
  }
  const commit = <span className="font-mono">{review.commit.slice(0, 7)}</span>;
  const links = (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <a href={review.reportUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-ink">Read the report</a>
      <a href={`/api/reviews/proof/${serviceId}`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink" title={`Signed by ${review.signer}. Compare with the address HEY publishes on heyresearch.xyz.`}>Signed by HEY</a>
    </span>
  );
  if (review.status === "out_of_date") {
    return (
      <div className="flex items-start gap-2.5 border-t border-line px-5 py-3 text-sm text-ink-3">
        <Logo size={20} />
        <div className="min-w-0 space-y-1">
          <p>Reviewed by {by} at commit {commit} on {day(review.reviewedAt)}. This endpoint has changed since, so that review is <span className="text-warn">out of date</span>.</p>
          {links}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 border-t border-line bg-card px-5 py-3 text-sm">
      <Logo size={20} />
      <div className="min-w-0 space-y-1">
        <p className="text-ink">{REVIEWED_LINE}</p>
        <p className="text-xs text-ink-3">Commit {commit} · {day(review.reviewedAt)} · by {by}</p>
        <div className="text-ink-2">{links}</div>
      </div>
    </div>
  );
}

/** Compact line for marketplace cards: shown when at least one live endpoint has a current review. */
export function ReviewedChip() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2" title={REVIEWED_LINE}>
      <Logo size={14} />
      Reviewed by {REVIEWER.name}
    </span>
  );
}
