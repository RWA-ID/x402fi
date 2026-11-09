import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";
import { currentSeller } from "@/lib/server/session";

/** Wizard step 4: call the seller's URL once, unpaid, and report what came back. */
export async function POST(req: Request) {
  if (!(await currentSeller())) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { url, method } = (await req.json()) as { url: string; method: string };
  let target: URL;
  try {
    target = await assertSafeUrl(url);
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof UnsafeUrlError ? e.message : "Could not check that URL." });
  }
  const t0 = Date.now();
  try {
    const r = await fetch(target, { method: method === "POST" ? "POST" : "GET", redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "x-x402fi-check": "1" }, body: method === "POST" ? "{}" : undefined });
    const text = await r.text();
    return Response.json({ ok: r.status < 500, status: r.status, ms: Date.now() - t0, contentType: r.headers.get("content-type"), sample: text.slice(0, 600) });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).name === "TimeoutError" ? "No answer within 10 seconds." : "Could not connect to that URL." });
  }
}
