import { getAddress, isAddress, namehash, parseAbi } from "viem";
import { robinhoodClient } from "@/lib/server/clients";
import { envAsync } from "@/lib/server/env";
import { payeeStatus, REASON_TEXT } from "@/lib/server/payee";
import { HOODFI_REGISTRY } from "@/lib/names";

const NAME_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/;
const ownerAbi = parseAbi(["function ownerOf(uint256) view returns (address)"]);

/**
 * GET /api/names/check?name=acme.hoodfi.eth&payTo=0x…[&upstream=https://api.acme.com]
 * Would this name verify as the payee for a new listing right now? Uses the same
 * verifier as the listing badge, fresh. `upstream` is set for native listings (buyers
 * contact the seller's origin); otherwise the origin is x402Fi's gateway.
 * For HoodFi names it also returns the owner, so the wizard can say which wallet signs.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const name = (q.get("name") ?? "").trim().toLowerCase();
  const payTo = (q.get("payTo") ?? "").trim();
  if (!NAME_RE.test(name)) return Response.json({ error: "Use a full name like acme.402api.eth or acme.hoodfi.eth." }, { status: 400 });
  if (!isAddress(payTo, { strict: false })) return Response.json({ error: "Set the payout wallet first." }, { status: 400 });
  let origin = new URL(req.url).origin;
  const up = q.get("upstream");
  if (up) {
    try {
      origin = new URL(up).origin;
    } catch {
      return Response.json({ error: "Bad upstream URL." }, { status: 400 });
    }
  }

  const status = await payeeStatus({ identityName: name, payTo: getAddress(payTo), origin, slug: "new", fresh: true });

  let owner: string | null = null;
  if (name.endsWith(".hoodfi.eth") && name.split(".").length === 3) {
    owner = await robinhoodClient(await envAsync())
      .readContract({ address: HOODFI_REGISTRY, abi: ownerAbi, functionName: "ownerOf", args: [BigInt(namehash(name))] })
      .then((a) => getAddress(a))
      .catch(() => null);
  }
  const reason = status.state === "mismatch" || status.state === "unknown" ? status.reason : null;
  return Response.json({
    name,
    origin,
    state: status.state, // verified | mismatch | unknown
    reason,
    reasonText: reason ? REASON_TEXT[reason] ?? reason : null,
    owner,
  });
}
