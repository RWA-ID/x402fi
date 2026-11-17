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

/**
 * The listing sidebar's own HEY card: logo, status across the live endpoints.
 * Shown only when some endpoint has a review; absence is not a negative signal.
 */
export function ReviewCard({ reviews }: { reviews: { review: PublicReview; serviceId: string; label: string }[] }) {
  if (!reviews.length) return null;
  const done = reviews.filter((r) => r.review.status === "reviewed");
  const stale = reviews.filter((r) => r.review.status === "out_of_date");
  const many = reviews.length > 1;
  const [status, tone] = done.length
    ? ["Reviewed", "text-good"]
    : stale.length === reviews.length
      ? ["Review out of date", "text-warn"]
      : ["Review in progress", "text-ink-2"];
  const first = done[0] ?? stale[0];
  const signed = first && first.review.status !== "in_progress" ? first.review : null;
  return (
    <div className="card p-5 text-sm">
      <div className="flex items-center gap-3">
        <Logo size={48} />
        <div className="min-w-0">
          <div className="text-[0.68rem] uppercase tracking-wider text-ink-3">Security review</div>
          <a href={REVIEWER.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">{REVIEWER.name}</a>
          <div className={`font-medium ${tone}`}>
            {status}
            {many && done.length ? <span className="font-normal text-ink-3"> · {done.length} of {reviews.length} endpoints</span> : null}
          </div>
        </div>
      </div>
      {done.length > 0 && <p className="mt-3 text-ink-2">{REVIEWED_LINE}.</p>}
      {!done.length && stale.length === reviews.length && <p className="mt-3 text-ink-3">The endpoint changed after it was reviewed, so the review no longer covers it.</p>}
      {!done.length && stale.length < reviews.length && <p className="mt-3 text-ink-3">{REVIEWER.name} is reviewing this listing&apos;s code. The result shows here once the review is complete.</p>}
      {signed && first && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
          {many && <span className="font-mono">{first.label}</span>}
          <span>Commit <span className="font-mono">{signed.commit.slice(0, 7)}</span> · {day(signed.reviewedAt)}</span>
          <a href={signed.reportUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-ink">Report</a>
          <a href={`/api/reviews/proof/${first.serviceId}`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink" title={`Signed by ${signed.signer}`}>Signed proof</a>
        </p>
      )}
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
