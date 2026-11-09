import { settlePayment, verifyPayment } from "@/lib/x402/facilitator";
import { robinhoodClient, settlementWallet } from "@/lib/server/clients";
import { envAsync } from "@/lib/server/env";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402/types";

/** Verifies again, then settles. Gas is paid by x402Fi. */
export async function POST(req: Request) {
  let body: { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements };
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, errorReason: "malformed_request" }, { status: 400 });
  }
  const e = await envAsync();
  const sw = settlementWallet(e);
  if (!sw) return Response.json({ success: false, errorReason: "settlement_not_configured" }, { status: 503 });
  const client = robinhoodClient(e);
  const v = await verifyPayment(client, body.paymentPayload, body.paymentRequirements);
  if (!v.isValid) return Response.json({ success: false, errorReason: v.invalidReason, transaction: "", network: body.paymentRequirements?.network, payer: v.payer }, { status: v.retryable ? 503 : 200 });
  return Response.json(await settlePayment(client, sw.wallet, sw.account, body.paymentPayload));
}
