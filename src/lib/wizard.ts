/** Pure helpers for the listing wizard (unit-tested in test/wizard.test.ts). */

/** "/v1/preflight/" → "/v1/preflight"; "" → "/". Same rule as the server. */
export function normalizePath(p: string): string {
  const s = ("/" + p.trim()).replace(/\/+/g, "/").replace(/\/$/, "");
  return s || "/";
}

/** The upstream URL the gateway calls for an endpoint + example. */
export function upstreamFor(base: string, path: string, example: string): string {
  try {
    const u = new URL(base);
    const ex = example.trim();
    const [exPath, exQuery] = ex.startsWith("/") ? ex.split("?") : ["", ex.startsWith("?") ? ex.slice(1) : ""];
    u.pathname = (u.pathname.replace(/\/$/, "") + (normalizePath(path) === "/" ? "" : normalizePath(path)) + (exPath ?? "")) || "/";
    if (exQuery) new URLSearchParams(exQuery).forEach((v, k) => u.searchParams.append(k, v));
    return u.toString();
  } catch {
    return base;
  }
}

/** A base URL with an API-looking path (/v1/…, /api/…) was probably pasted from one endpoint. */
export function baseLooksLikeEndpoint(url: string): { origin: string; path: string } | null {
  try {
    const u = new URL(url.trim());
    const p = u.pathname.replace(/\/$/, "");
    if (!p || p === "") return null;
    if (/^\/(v\d+|api)(\/|$)/i.test(p) && p.split("/").filter(Boolean).length >= 2) return { origin: u.origin, path: p };
    return null;
  } catch {
    return null;
  }
}
