"use client";
import { useState } from "react";
import { EMPTY_REVIEW, ReviewFields, ReviewIntro, type ReviewDraft } from "@/components/ReviewRequest";
import { listerCan, REVIEWER, type ReviewState } from "@/lib/reviews";

export interface DashEndpoint {
  id: string; listingId: string; name: string; method: string; path: string; status: string;
  review: null | {
    state: ReviewState; repoUrl: string | null; commit: string | null; contact: string;
    reviewedCommit: string | null; reportUrl: string | null; reviewedAt: number | null; outOfDate: boolean;
  };
}

/** The lister's own view: the private states too (findings sent), which buyers never see. */
const LABEL: Record<ReviewState, string> = {
  requested: "Requested · waiting for HEY",
  findings_sent: "Findings sent to you · fix them, then submit the commit",
  fixes_submitted: "Fixes submitted · HEY is re-testing",
  reviewed: "Reviewed",
  withdrawn: "Withdrawn",
};

export function ReviewPanel({ listingId, endpoints, reload, notify }: { listingId: string; endpoints: DashEndpoint[]; reload: () => void; notify: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<ReviewDraft>({ ...EMPTY_REVIEW, want: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState<{ id: string; commit: string; err: string } | null>(null);
  const requestable = endpoints.filter((e) => e.status === "live" && listerCan(e.review?.state ?? null).request);
  const any = endpoints.some((e) => e.review);

  const request = async () => {
    setBusy(true); setErrors({});
    const res = await fetch("/api/reviews", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId, serviceIds: r.endpoints.length ? r.endpoints : requestable.map((e) => e.id), repoUrl: r.repoUrl, commit: r.commit, contact: r.contact, note: r.note }),
    });
    const j = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string; requested?: string[] };
    setBusy(false);
    if (!res.ok) { setErrors(j.errors ?? { endpoints: j.error ?? "Could not send the request." }); return; }
    setOpen(false); setR({ ...EMPTY_REVIEW, want: true });
    notify(`Review requested for ${j.requested?.length ?? 0} endpoint${j.requested?.length === 1 ? "" : "s"}. HEY Research Lab will contact you.`);
    reload();
  };
  const act = async (id: string, body: object) => {
    const res = await fetch(`/api/reviews/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; errors?: Record<string, string> };
    if (!res.ok) return j.errors?.commit ?? j.error ?? "Could not update.";
    reload();
    return "";
  };

  const header = (sub: React.ReactNode) => (
    <div className="flex min-w-0 items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={REVIEWER.logo} alt={REVIEWER.name} width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <div className="text-[0.68rem] uppercase tracking-wider text-ink-3">Security review</div>
        <a href={REVIEWER.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">{REVIEWER.name}</a>
        <div className="text-sm text-ink-2">{sub}</div>
      </div>
    </div>
  );

  if (!any && !open) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4 text-sm">
        {header("Get an independent security review. Reviewed listings are featured.")}
        {requestable.length > 0 && <button className="btn btn-ghost py-1.5" onClick={() => setOpen(true)}>Request a review</button>}
      </div>
    );
  }
  const reviewed = endpoints.filter((e) => e.review?.state === "reviewed" && !e.review.outOfDate).length;
  const withReview = endpoints.filter((e) => e.review).length;
  return (
    <div className="mt-4 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header(withReview ? (reviewed ? <span className="text-good">{reviewed} of {withReview} endpoint{withReview === 1 ? "" : "s"} reviewed</span> : "In progress") : "Request a review")}
        {!open && requestable.length > 0 && <button className="btn btn-ghost py-1.5 text-sm" onClick={() => setOpen(true)}>Request a review</button>}
      </div>
      {any && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {endpoints.filter((e) => e.review).map((e) => {
            const rv = e.review!;
            const can = listerCan(rv.state);
            return (
              <li key={e.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{e.method} {e.path}</span>
                  <span className={rv.state === "reviewed" && !rv.outOfDate ? "text-good" : rv.state === "findings_sent" || rv.outOfDate ? "text-warn" : "text-ink-2"}>
                    {rv.state === "reviewed" && rv.outOfDate ? "Reviewed, now out of date: the endpoint changed. Request a new review." : LABEL[rv.state]}
                  </span>
                </div>
                {rv.state === "reviewed" && rv.reportUrl && (
                  <p className="mt-1 text-xs text-ink-3">Commit <span className="font-mono">{rv.reviewedCommit?.slice(0, 7)}</span> · <a href={rv.reportUrl} target="_blank" rel="noopener noreferrer" className="underline">report</a></p>
                )}
                {(rv.state === "requested" || rv.state === "findings_sent" || rv.state === "fixes_submitted") && (
                  <p className="mt-1 text-xs text-ink-3">Buyers see &ldquo;Review in progress&rdquo;.{rv.commit ? <> Commit <span className="font-mono">{rv.commit.slice(0, 7)}</span>.</> : null}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {can.submitFixes && fix?.id !== e.id && <button className="btn btn-primary py-1 text-xs" onClick={() => setFix({ id: e.id, commit: "", err: "" })}>Fixes are in</button>}
                  {can.cancel && <button className="btn btn-ghost py-1 text-xs" onClick={async () => { const m = await act(e.id, { action: "cancel" }); if (m) notify(m); }}>Cancel review</button>}
                </div>
                {fix?.id === e.id && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="flex-1">
                      <input className="field font-mono" value={fix.commit} onChange={(ev) => setFix({ ...fix, commit: ev.target.value })} placeholder="Commit with the fixes" spellCheck={false} autoCapitalize="none" />
                      {fix.err && <p className="mt-1 text-xs text-bad">{fix.err}</p>}
                    </div>
                    <button className="btn btn-primary" onClick={async () => { const m = await act(e.id, { action: "fixes_submitted", commit: fix.commit }); if (m) setFix({ ...fix, err: m }); else { setFix(null); notify("Fixes submitted. HEY will re-test them."); } }}>Submit</button>
                    <button className="btn btn-ghost" onClick={() => setFix(null)}>Cancel</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <div className="mt-4 space-y-5 border-t border-line pt-4">
          <ReviewIntro />
          <ReviewFields r={r} set={(p) => setR((x) => ({ ...x, ...p }))} errors={errors} endpoints={requestable.map((e) => [e.id, `${e.method} ${e.path}`])} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={request}>{busy ? "Sending…" : "Request the review"}</button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
