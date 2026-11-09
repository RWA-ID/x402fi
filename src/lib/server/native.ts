import "server-only";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";
import { HEADERS } from "@/lib/x402/encoding";
import { parseNative402, type NativeProbe } from "@/lib/x402/native";
import { envAsync } from "./env";

const TTL = 600;

/** The seller's direct URL for a native endpoint: listing base + endpoint path + example. */
export function nativeUrl(upstreamUrl: string, path: string, example?: string | null): string {
  const u = new URL(upstreamUrl);
  const base = u.pathname.replace(/\/$/, "");
  const p = path === "/" ? "" : path;
  const ex = (example ?? "").trim();
  const [exPath, exQuery] = ex.startsWith("?") ? ["", ex.slice(1)] : ex.split("?");
  u.pathname = (base + p + (exPath && exPath.startsWith("/") ? exPath : "")) || "/";
  if (exQuery) new URLSearchParams(exQuery).forEach((v, k) => u.searchParams.append(k, v));
  return u.toString();
}

/**
 * Calls a seller's own x402 endpoint once, unpaid, and reads its 402. Cached (failures
 * briefly, so a seller fixing their endpoint shows up fast). Never sends a payment.
 */
export async function probeNative(url: string, method: string, body: string | null, opts: { fresh?: boolean } = {}): Promise<NativeProbe> {
  const e = await envAsync();
  const key = `native:${method}:${url}:${body ?? ""}`;
  if (!opts.fresh) {
    const hit = await e.KV.get(key, "json").catch(() => null);
    if (hit) return hit as NativeProbe;
  }
  let result: NativeProbe;
  try {
    await assertSafeUrl(url);
    const r = await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "x402Fi-listing-probe/1 (+https://x402fi.dev)" },
      body: method === "GET" || method === "HEAD" ? undefined : body ?? "{}",
    });
    const text = (await r.text()).slice(0, 100_000);
    result = parseNative402(r.status, r.headers.get(HEADERS.required), text);
  } catch (err) {
    result = { ok: false, reason: err instanceof UnsafeUrlError ? err.message : (err as Error).name === "TimeoutError" ? "the endpoint did not answer within 8 seconds" : "could not reach the endpoint" };
  }
  await e.KV.put(key, JSON.stringify(result), { expirationTtl: result.ok ? TTL : 60 }).catch(() => {});
  return result;
}
