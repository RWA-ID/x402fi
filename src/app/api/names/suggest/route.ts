import { getMintFee, isAvailable, validateLabel } from "@x402identity/widget-core";
import { mainnetClient, robinhoodClient } from "@/lib/server/clients";
import { envAsync } from "@/lib/server/env";
import { quoteLabel } from "@/lib/x402/contract";
import { HOODFI_X402_REGISTRAR, X402ID_FORWARDER, X402ID_PARENTS, X402ID_REGISTRAR, suggestLabels, toLabel, type NameSuggestion } from "@/lib/names";

/**
 * GET /api/names/suggest?name=<service name>[&label=<custom>][&parent=402api.eth]
 * Name ideas for the listing wizard, each checked live on both registries:
 * HoodFi (Robinhood Chain, USDG price) and x402 Identity (Ethereum, ETH mint fee).
 * Read-only chain calls; cached briefly per label at the edge.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const custom = toLabel(q.get("label") ?? "");
  const labels = custom ? [custom] : suggestLabels(q.get("name") ?? "");
  if (!labels.length) return Response.json({ suggestions: [] });
  const parent = X402ID_PARENTS.find((p) => p.label === q.get("parent")) ?? X402ID_PARENTS[0]!;

  const e = await envAsync();
  const rh = robinhoodClient(e);
  const eth = mainnetClient(e);
  const cfg = { registrar: X402ID_REGISTRAR, forwarder: X402ID_FORWARDER, publicClient: eth as never };
  const feeP = getMintFee(cfg).catch(() => null);

  const suggestions: NameSuggestion[] = await Promise.all(
    labels.map(async (label) => {
      const [h, x] = await Promise.all([
        quoteLabel(rh, HOODFI_X402_REGISTRAR, label),
        (async () => {
          const bad = validateLabel(label);
          if (bad) return { available: false as const, reason: bad };
          try {
            const ok = await isAvailable(cfg, parent.node, label);
            if (!ok) return { available: false as const, reason: "Taken" };
            const fee = await feeP;
            return fee === null ? { available: null, reason: "Could not read the mint fee." } : { available: true as const, feeWei: fee.toString() };
          } catch {
            return { available: null, reason: "Ethereum could not be reached." };
          }
        })(),
      ]);
      const hoodfi: NameSuggestion["hoodfi"] = h.ok
        ? { available: true, priceAtomic: h.amountAtomic.toString() }
        : h.unavailable
          ? { available: false, reason: h.status === 1 ? "Taken" : h.message }
          : { available: null, reason: "Robinhood Chain could not be reached." };
      return { label, hoodfi, x402: { ...x, parent: parent.label } as NameSuggestion["x402"] };
    }),
  );
  return Response.json({ suggestions }, { headers: { "cache-control": "public, max-age=30" } });
}
