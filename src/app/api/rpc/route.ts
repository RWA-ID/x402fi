import { ROBINHOOD_RPC_DIRECT } from "@/lib/chains";
import { envAsync } from "@/lib/server/env";

/**
 * Browser → Robinhood Chain RPC. The chain's own endpoint returns a duplicated
 * `access-control-allow-origin: *,*` on POST, which browsers reject. Read-only
 * and signed-tx methods only.
 */
const ALLOWED = new Set([
  "eth_chainId", "eth_blockNumber", "eth_call", "eth_getBalance", "eth_getTransactionReceipt", "eth_getTransactionByHash",
  "eth_getBlockByNumber", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory",
  "eth_getTransactionCount", "eth_getCode", "eth_sendRawTransaction", "net_version", "eth_getLogs",
]);

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 100_000) return new Response("too large", { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  if (calls.length > 20 || !calls.every((c) => ALLOWED.has((c as { method?: string })?.method ?? ""))) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "method not allowed" } }, { status: 400 });
  }
  const e = await envAsync();
  const r = await fetch(e.ROBINHOOD_RPC_URL || ROBINHOOD_RPC_DIRECT, { method: "POST", headers: { "content-type": "application/json" }, body: text });
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
}
