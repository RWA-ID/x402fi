import { currentSeller } from "@/lib/server/session";
import { probeNative } from "@/lib/server/native";

/** Wizard: read a seller's own x402 endpoint's 402 (unpaid, never pays). Signed-in sellers only. */
export async function POST(req: Request) {
  if (!(await currentSeller())) return Response.json({ ok: false, reason: "Sign in first." }, { status: 401 });
  const { url, method, body } = (await req.json()) as { url?: string; method?: string; body?: string | null };
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return Response.json({ ok: false, reason: "Use the https:// URL of your x402 endpoint." });
  const m = method === "POST" ? "POST" : "GET";
  if (m === "POST" && body) {
    try { JSON.parse(body); } catch { return Response.json({ ok: false, reason: "The example body must be valid JSON." }); }
  }
  return Response.json(await probeNative(url, m, m === "POST" ? body ?? "{}" : null, { fresh: true }));
}
