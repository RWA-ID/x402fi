import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  applySignedReview, listerCan, parseReviewMessage, parseSigners, publicReview, reviewTarget, validateRequest,
  REVIEW_DOMAIN, REVIEW_TYPES, type ReviewMessage, type ReviewRow,
} from "@/lib/reviews";

const hey = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const SIGNERS = parseSigners(`${hey.address}, not-an-address`);
const NOW = 1_794_900_000;
const TARGET = reviewTarget("GET", "/v1/rug", "https://api.acme.com/");
const COMMIT = "a".repeat(40);

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  state: "requested", lastIssuedAt: null, reviewedCommit: null, reportUrl: null, reviewedAt: null, reviewedTarget: null, signer: null, ...over,
});
const msg = (over: Partial<ReviewMessage> = {}): ReviewMessage => ({
  listing: "acme-rug", endpoint: "svc-1", commit: COMMIT, reportUrl: "https://heyresearch.xyz/r/1", state: "reviewed", issuedAt: NOW, ...over,
});
const sign = (m: ReviewMessage, who = hey) =>
  who.signTypedData({ domain: REVIEW_DOMAIN, types: REVIEW_TYPES, primaryType: "Review", message: { ...m, issuedAt: BigInt(m.issuedAt) } });

async function apply(m: ReviewMessage, opts: { current?: ReviewRow | null; who?: typeof hey; requestedAt?: number | null; logged?: number | null; slug?: string } = {}) {
  return applySignedReview({
    message: m, signature: await sign(m, opts.who), signers: SIGNERS,
    current: opts.current === undefined ? row() : opts.current,
    requestedAt: opts.requestedAt === undefined ? NOW - 3600 : opts.requestedAt,
    latestLoggedIssuedAt: opts.logged ?? null,
    listingSlug: opts.slug ?? "acme-rug", target: TARGET, now: NOW,
  });
}

describe("signed review states", () => {
  it("applies a reviewed message signed by the published key and pins commit, report and target", async () => {
    const r = await apply(msg());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.signer).toBe(hey.address);
    expect(r.next).toMatchObject({ state: "reviewed", reviewedCommit: COMMIT, reportUrl: "https://heyresearch.xyz/r/1", reviewedAt: NOW, reviewedTarget: TARGET, lastIssuedAt: NOW });
  });

  it("refuses any other signer, including the lister", async () => {
    const r = await apply(msg(), { who: stranger });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses everything when no signer is configured", async () => {
    const m = msg();
    const r = await applySignedReview({ message: m, signature: await sign(m), signers: [], current: row(), requestedAt: null, latestLoggedIssuedAt: null, listingSlug: "acme-rug", target: TARGET, now: NOW });
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses a tampered message (signature no longer recovers to HEY)", async () => {
    const m = msg();
    const sig = await sign(m);
    const r = await applySignedReview({ message: { ...m, commit: "b".repeat(40) }, signature: sig, signers: SIGNERS, current: row(), requestedAt: null, latestLoggedIssuedAt: null, listingSlug: "acme-rug", target: TARGET, now: NOW });
    expect(r.ok).toBe(false);
  });

  it("only HEY's states can be signed: requested / fixes_submitted are the lister's", async () => {
    for (const state of ["requested", "fixes_submitted", "audited"]) expect(await apply(msg({ state }))).toMatchObject({ ok: false, status: 422 });
  });

  it("needs a lister request first", async () => {
    expect(await apply(msg(), { current: null })).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a message for another listing", async () => {
    expect(await apply(msg(), { slug: "other" })).toMatchObject({ ok: false, status: 422 });
  });

  it("refuses replays: issuedAt must beat the row and the signed-event log", async () => {
    expect(await apply(msg(), { current: row({ lastIssuedAt: NOW }) })).toMatchObject({ ok: false, status: 409 });
    // A cancelled row is gone, but the event log still remembers the last message.
    expect(await apply(msg(), { logged: NOW })).toMatchObject({ ok: false, status: 409 });
    expect((await apply(msg({ issuedAt: NOW + 1 }), { logged: NOW })).ok).toBe(true);
  });

  it("refuses a message signed before the lister's current request (about older code)", async () => {
    expect(await apply(msg({ issuedAt: NOW - 7200 }), { requestedAt: NOW - 600 })).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a message dated in the future", async () => {
    expect(await apply(msg({ issuedAt: NOW + 3600 }))).toMatchObject({ ok: false, status: 422 });
  });

  it("reviewed needs a commit hash and an https report", async () => {
    expect(await apply(msg({ commit: "" }))).toMatchObject({ ok: false, status: 422 });
    expect(await apply(msg({ commit: "main" }))).toMatchObject({ ok: false, status: 422 });
    expect(await apply(msg({ reportUrl: "http://heyresearch.xyz/r/1" }))).toMatchObject({ ok: false, status: 422 });
  });

  it("findings_sent and withdrawn need no commit or report", async () => {
    const f = await apply(msg({ state: "findings_sent", commit: "", reportUrl: "" }));
    expect(f).toMatchObject({ ok: true, next: { state: "findings_sent" } });
    const w = await apply(msg({ state: "withdrawn", commit: "", reportUrl: "" }), { current: row({ state: "reviewed", reviewedCommit: COMMIT, reportUrl: "https://x.y/r", reviewedAt: NOW - 10, reviewedTarget: TARGET, signer: hey.address, lastIssuedAt: NOW - 10 }) });
    expect(w).toMatchObject({ ok: true, next: { state: "withdrawn" } });
  });

  it("parses the posted JSON, uint64 as a string included", () => {
    expect(parseReviewMessage({ ...msg(), issuedAt: String(NOW) })).toEqual(msg());
    expect(parseReviewMessage({ ...msg(), issuedAt: -1 })).toBeNull();
    expect(parseReviewMessage({ listing: "x" })).toBeNull();
  });
});

describe("what buyers see", () => {
  const reviewed = row({ state: "reviewed", reviewedCommit: COMMIT, reportUrl: "https://heyresearch.xyz/r/1", reviewedAt: NOW, reviewedTarget: TARGET, signer: hey.address });

  it("requested, findings_sent and fixes_submitted look identical, so findings never show before they are fixed", () => {
    const faces = (["requested", "findings_sent", "fixes_submitted"] as const).map((state) => publicReview(row({ state }), TARGET));
    expect(faces).toEqual([{ status: "in_progress" }, { status: "in_progress" }, { status: "in_progress" }]);
  });

  it("reviewed shows commit, report, date and signer", () => {
    expect(publicReview(reviewed, TARGET)).toEqual({ status: "reviewed", commit: COMMIT, reportUrl: "https://heyresearch.xyz/r/1", reviewedAt: NOW, signer: hey.address });
  });

  it("goes out of date when the method, path or upstream changes", () => {
    expect(publicReview(reviewed, reviewTarget("POST", "/v1/rug", "https://api.acme.com"))?.status).toBe("out_of_date");
    expect(publicReview(reviewed, reviewTarget("GET", "/v2/rug", "https://api.acme.com"))?.status).toBe("out_of_date");
    expect(publicReview(reviewed, reviewTarget("GET", "/v1/rug", "https://api.evil.com"))?.status).toBe("out_of_date");
    expect(publicReview(reviewed, null)?.status).toBe("out_of_date");
    // A trailing slash on the base is not a change.
    expect(publicReview(reviewed, reviewTarget("get", "/v1/rug", "https://api.acme.com"))?.status).toBe("reviewed");
  });

  it("withdrawn shows nothing", () => {
    expect(publicReview({ ...reviewed, state: "withdrawn" }, TARGET)).toBeNull();
    expect(publicReview(null, TARGET)).toBeNull();
  });
});

describe("lister moves", () => {
  it("follows the agreed states", () => {
    expect(listerCan(null)).toEqual({ request: true, submitFixes: false, cancel: false });
    expect(listerCan("requested")).toEqual({ request: false, submitFixes: false, cancel: true });
    expect(listerCan("findings_sent")).toEqual({ request: false, submitFixes: true, cancel: true });
    expect(listerCan("fixes_submitted")).toEqual({ request: false, submitFixes: false, cancel: true });
    expect(listerCan("reviewed")).toEqual({ request: true, submitFixes: false, cancel: false });
    expect(listerCan("withdrawn")).toEqual({ request: true, submitFixes: false, cancel: false });
  });

  it("validates the request: contact required, repo https, commit hex", () => {
    expect(validateRequest({ contact: "me@acme.com" })).toEqual({ ok: true, value: { repoUrl: null, commit: null, contact: "me@acme.com", note: null } });
    expect(validateRequest({ contact: "me@acme.com", commit: " ABCDEF1 " })).toMatchObject({ ok: true, value: { commit: "abcdef1" } });
    const bad = validateRequest({ contact: "", repoUrl: "http://github.com/x", commit: "main" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["commit", "contact", "repoUrl"]);
  });
});
