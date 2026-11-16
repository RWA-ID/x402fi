"use client";
import { REVIEWER } from "@/lib/reviews";

export interface ReviewDraft {
  want: boolean;
  repoUrl: string;
  commit: string;
  contact: string;
  note: string;
  /** Endpoint keys ("GET /v1/rates") or ids to review; empty = every live endpoint. */
  endpoints: string[];
}
export const EMPTY_REVIEW: ReviewDraft = { want: false, repoUrl: "", commit: "", contact: "", note: "", endpoints: [] };

/** What HEY Research Lab does, said once, the same way in the wizard and the dashboard. */
export function ReviewIntro() {
  return (
    <div className="flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={REVIEWER.logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[10px]" />
      <div className="text-sm text-ink-2">
        <p>
          <a href={REVIEWER.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">{REVIEWER.name}</a> reviews your
          endpoint&apos;s code, sends you any findings privately, and re-tests once you&apos;ve fixed them. Free for now.
        </p>
        <p className="mt-2">
          Your listing shows <strong>Review in progress</strong> until HEY signs the result. Then it shows
          &ldquo;Independent review by HEY Research Lab, findings fixed and re-tested&rdquo; with the report and the reviewed commit,
          and it&apos;s featured in the marketplace. Only HEY can set that, and it marks itself out of date if the endpoint changes.
        </p>
      </div>
    </div>
  );
}

/** The request fields. Errors are keyed like the API's (repoUrl, commit, contact, note). */
export function ReviewFields({ r, set, errors, endpoints }: {
  r: ReviewDraft;
  set: (patch: Partial<ReviewDraft>) => void;
  errors: Record<string, string>;
  /** [key, label] for each endpoint that can be picked. */
  endpoints: [string, string][];
}) {
  const picked = r.endpoints.length ? r.endpoints : endpoints.map(([k]) => k);
  const toggle = (k: string) => {
    const next = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
    set({ endpoints: next.length === endpoints.length ? [] : next });
  };
  return (
    <div className="space-y-4">
      {endpoints.length > 1 && (
        <fieldset>
          <legend className="eyebrow">Endpoints to review</legend>
          <div className="mt-2 space-y-1.5">
            {endpoints.map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} />
                <span className="font-mono">{label}</span>
              </label>
            ))}
          </div>
          {errors.endpoints && <p className="mt-1.5 text-sm text-bad">{errors.endpoints}</p>}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="block">
          <span className="eyebrow">Repository (optional)</span>
          <input className="field mt-2" value={r.repoUrl} onChange={(e) => set({ repoUrl: e.target.value })} placeholder="https://github.com/acme/api" spellCheck={false} autoCapitalize="none" />
          <span className={`mt-1.5 block text-sm ${errors.repoUrl ? "text-bad" : "text-ink-3"}`}>{errors.repoUrl ?? "Closed source? Leave it empty and share the code with HEY privately: they pin the commit without publishing it."}</span>
        </label>
        <label className="block">
          <span className="eyebrow">Commit (optional)</span>
          <input className="field mt-2 font-mono" value={r.commit} onChange={(e) => set({ commit: e.target.value })} placeholder="a1b2c3d" spellCheck={false} autoCapitalize="none" />
          {errors.commit && <span className="mt-1.5 block text-sm text-bad">{errors.commit}</span>}
        </label>
      </div>
      <label className="block">
        <span className="eyebrow">How HEY can reach you</span>
        <input className="field mt-2" value={r.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="you@acme.com, @acme on X or Telegram" spellCheck={false} autoCapitalize="none" />
        <span className={`mt-1.5 block text-sm ${errors.contact ? "text-bad" : "text-ink-3"}`}>{errors.contact ?? "Findings come to you here, privately."}</span>
      </label>
      <label className="block">
        <span className="eyebrow">Note for HEY (optional)</span>
        <textarea className="field mt-2 min-h-16" value={r.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} placeholder="Anything they should know: auth, rate limits, how to test it. No secrets here." />
      </label>
      <p className="text-xs text-ink-3">HEY sees your API&apos;s base URL, the endpoints you pick, and what you enter here. Nothing here is shown on your listing.</p>
    </div>
  );
}
