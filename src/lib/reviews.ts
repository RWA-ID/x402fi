import { getAddress, isAddress, recoverTypedDataAddress, type Hex } from "viem";

/**
 * Independent security reviews by HEY Research Lab (agreed with HEY 2026-11-16).
 *
 * One review per endpoint. Who may set each state:
 *   requested        the lister (wizard or dashboard)
 *   findings_sent    HEY, signed
 *   fixes_submitted  the lister, after findings_sent, naming the commit with the fixes
 *   reviewed         HEY, signed, after re-testing the fixes at a specific commit
 *   withdrawn        HEY, signed (e.g. a regression)
 *
 * In public, requested / findings_sent / fixes_submitted all read "Review in progress", so
 * nobody can tell findings exist before they are fixed. Only "reviewed" shows HEY's line,
 * and it falls back to "out of date" once the endpoint's method, path or upstream changes.
 * Never call anything "audited" or "safe".
 */

export const REVIEW_STATES = ["requested", "findings_sent", "fixes_submitted", "reviewed", "withdrawn"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
/** The states only HEY's signature can set. */
export const SIGNED_STATES = ["findings_sent", "reviewed", "withdrawn"] as const;
export type SignedState = (typeof SIGNED_STATES)[number];

export const REVIEWER = {
  name: "HEY Research Lab",
  url: "https://heyresearch.xyz",
  x: "heyresearch",
  logo: "/partners/hey-research-lab.svg",
} as const;

/** HEY's exact public wording for a reviewed endpoint. */
export const REVIEWED_LINE = "Independent review by HEY Research Lab, findings fixed and re-tested";

export const REVIEW_DOMAIN = { name: "HEY Security Review", version: "1" } as const;
export const REVIEW_TYPES = {
  Review: [
    { name: "listing", type: "string" }, // listing slug
    { name: "endpoint", type: "string" }, // x402Fi endpoint (service) id
    { name: "commit", type: "string" },
    { name: "reportUrl", type: "string" },
    { name: "state", type: "string" },
    { name: "issuedAt", type: "uint64" }, // unix seconds
  ],
} as const;

export interface ReviewMessage {
  listing: string;
  endpoint: string;
  commit: string;
  reportUrl: string;
  state: string;
  issuedAt: number;
}

/** The stored review for one endpoint (the `reviews` row, as the rules need it). */
export interface ReviewRow {
  state: ReviewState;
  /** issuedAt of the last signed message applied; a new one must be later. */
  lastIssuedAt: number | null;
  reviewedCommit: string | null;
  reportUrl: string | null;
  reviewedAt: number | null;
  /** The endpoint's target when it was reviewed: see reviewTarget(). */
  reviewedTarget: string | null;
  signer: string | null;
}

/** What a review pins: method, path and the seller's upstream base. A change makes it out of date. */
export function reviewTarget(method: string, path: string, upstreamUrl: string): string {
  return `${method.toUpperCase()} ${upstreamUrl.replace(/\/+$/, "")}${path === "/" ? "" : path}`;
}

export const COMMIT_RE = /^[0-9a-f]{7,64}$/;
const MAX_FUTURE_SKEW = 300;

/** The allowed signer addresses from the HEY_REVIEW_SIGNERS var (comma-separated). */
export function parseSigners(v: string | undefined): `0x${string}`[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter((s) => isAddress(s, { strict: false })).map((s) => getAddress(s));
}

function isHttpsUrl(s: string): boolean {
  try { return new URL(s).protocol === "https:" && s.length <= 500; } catch { return false; }
}

/** Shape-checks the JSON HEY posts. Numbers may arrive as strings (uint64). */
export function parseReviewMessage(x: unknown): ReviewMessage | null {
  if (!x || typeof x !== "object") return null;
  const m = x as Record<string, unknown>;
  const str = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
  const issued = typeof m.issuedAt === "number" ? m.issuedAt : typeof m.issuedAt === "string" && /^\d{1,12}$/.test(m.issuedAt) ? Number(m.issuedAt) : NaN;
  const listing = str("listing"), endpoint = str("endpoint"), commit = str("commit"), reportUrl = str("reportUrl"), state = str("state");
  if (listing === null || endpoint === null || commit === null || reportUrl === null || state === null || !Number.isSafeInteger(issued) || issued < 0) return null;
  return { listing, endpoint, commit, reportUrl, state, issuedAt: issued };
}

export type SignedCheck =
  | { ok: true; signer: `0x${string}`; next: ReviewRow }
  | { ok: false; status: number; error: string };

/**
 * Checks a signed review message against the published signer(s) and the current row,
 * and returns the row to store. `listingSlug` is the slug of the endpoint's listing,
 * `target` its reviewTarget() now. Pure apart from signature recovery.
 */
export async function applySignedReview(opts: {
  message: ReviewMessage;
  signature: Hex;
  signers: readonly `0x${string}`[];
  current: ReviewRow | null;
  /** When the lister last requested: a message signed before it is about older code. */
  requestedAt: number | null;
  /** Latest issuedAt in the signed-event log, which outlives a cancelled row. */
  latestLoggedIssuedAt: number | null;
  listingSlug: string;
  target: string;
  now: number;
}): Promise<SignedCheck> {
  const { message: m, current } = opts;
  if (!opts.signers.length) return { ok: false, status: 503, error: "No reviewer signer is configured." };
  let signer: `0x${string}`;
  try {
    signer = getAddress(await recoverTypedDataAddress({
      domain: REVIEW_DOMAIN, types: REVIEW_TYPES, primaryType: "Review",
      message: { ...m, issuedAt: BigInt(m.issuedAt) }, signature: opts.signature,
    }));
  } catch {
    return { ok: false, status: 400, error: "The signature could not be read." };
  }
  if (!opts.signers.includes(signer)) return { ok: false, status: 401, error: `Signed by ${signer}, which is not a published reviewer key.` };
  if (!(SIGNED_STATES as readonly string[]).includes(m.state)) return { ok: false, status: 422, error: `state must be one of ${SIGNED_STATES.join(", ")}.` };
  if (m.listing !== opts.listingSlug) return { ok: false, status: 422, error: "listing does not match the endpoint's listing." };
  if (!current) return { ok: false, status: 409, error: "The lister has not requested a review of this endpoint." };
  if (m.issuedAt > opts.now + MAX_FUTURE_SKEW) return { ok: false, status: 422, error: "issuedAt is in the future." };
  const floor = Math.max(current.lastIssuedAt ?? -1, opts.latestLoggedIssuedAt ?? -1);
  if (m.issuedAt <= floor) return { ok: false, status: 409, error: "A newer or identical message was already applied (issuedAt)." };
  if (opts.requestedAt !== null && m.issuedAt < opts.requestedAt - MAX_FUTURE_SKEW) return { ok: false, status: 409, error: "issuedAt is before the lister's current request: it is about older code." };
  const state = m.state as SignedState;
  if (state === "reviewed") {
    if (!COMMIT_RE.test(m.commit)) return { ok: false, status: 422, error: "reviewed needs the reviewed commit hash (7-64 lowercase hex)." };
    if (!isHttpsUrl(m.reportUrl)) return { ok: false, status: 422, error: "reviewed needs an https:// reportUrl." };
  }
  if (m.reportUrl && !isHttpsUrl(m.reportUrl)) return { ok: false, status: 422, error: "reportUrl must be https://." };
  const base = { ...current, state, lastIssuedAt: m.issuedAt, signer };
  const next: ReviewRow = state === "reviewed"
    ? { ...base, reviewedCommit: m.commit, reportUrl: m.reportUrl, reviewedAt: m.issuedAt, reviewedTarget: opts.target }
    : base; // findings_sent / withdrawn keep the last reviewed details for the record, but they are no longer shown
  return { ok: true, signer, next };
}

/** What the lister may do from each state. */
export function listerCan(state: ReviewState | null): { request: boolean; submitFixes: boolean; cancel: boolean } {
  return {
    request: state === null || state === "withdrawn" || state === "reviewed",
    submitFixes: state === "findings_sent",
    cancel: state === "requested" || state === "findings_sent" || state === "fixes_submitted",
  };
}

/** The public face of a review. Never distinguishes requested / findings_sent / fixes_submitted. */
export type PublicReview =
  | { status: "in_progress" }
  | { status: "reviewed" | "out_of_date"; commit: string; reportUrl: string; reviewedAt: number; signer: string };

export function publicReview(row: ReviewRow | null, targetNow: string | null): PublicReview | null {
  if (!row) return null;
  if (row.state === "requested" || row.state === "findings_sent" || row.state === "fixes_submitted") return { status: "in_progress" };
  if (row.state !== "reviewed" || !row.reviewedCommit || !row.reportUrl || !row.reviewedAt || !row.signer) return null;
  const stale = !targetNow || row.reviewedTarget !== targetNow;
  return { status: stale ? "out_of_date" : "reviewed", commit: row.reviewedCommit, reportUrl: row.reportUrl, reviewedAt: row.reviewedAt, signer: row.signer };
}

/** The lister's request fields, validated. Source can be shared privately with HEY instead of a public repo. */
export function validateRequest(i: { repoUrl?: unknown; commit?: unknown; contact?: unknown; note?: unknown }):
  { ok: true; value: { repoUrl: string | null; commit: string | null; contact: string; note: string | null } } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const repoUrl = s(i.repoUrl) || null;
  const commit = s(i.commit).toLowerCase() || null;
  const contact = s(i.contact);
  const note = s(i.note) || null;
  if (repoUrl && !isHttpsUrl(repoUrl)) e.repoUrl = "Use an https:// link to the repository.";
  if (commit && !COMMIT_RE.test(commit)) e.commit = "A commit hash: 7 to 64 hex characters.";
  if (contact.length < 3 || contact.length > 200) e.contact = "How HEY can reach you: an email, X handle or Telegram.";
  if (note && note.length > 1000) e.note = "Keep it under 1,000 characters.";
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: { repoUrl, commit, contact, note } };
}
