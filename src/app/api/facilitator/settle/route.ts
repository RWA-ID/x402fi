import { getAddress } from "viem";
import { facilitatorPolicyReason, settlePayment, verifyPayment } from "@/lib/x402/facilitator";
import { robinhoodClient, settlementWallet } from "@/lib/server/clients";
import { envAsync } from "@/lib/server/env";
import { isListedPayee } from "@/lib/server/facilitatorPolicy";
import { NETWORK } from "@/lib/chains";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402/types";

/**
 * Verifies again, then settles. Gas is paid by x402Fi, so the facilitator settles only
 * what pays someone: at least the minimum price, not to the payer itself, and to the
 * payout wallet of a listing on x402Fi (`pay_to_not_listed` otherwise).
 */
export async function POST(req: Request) {
  let body: { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements };
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, errorReason: "malformed_request" }, { status: 400 });
  }
  if (!body?.paymentPayload || !body?.paymentRequirements) return Response.json({ success: false, errorReason: "malformed_request" }, { status: 400 });
  const refuse = (errorReason: string, payer?: string, status = 200) =>
    Response.json({ success: false, errorReason, transaction: "", network: NETWORK, payer }, { status });
  const refused = facilitatorPolicyReason(body.paymentPayload);
  if (refused) return refuse(refused);
  const e = await envAsync();
  const sw = settlementWallet(e);
  if (!sw) return Response.json({ success: false, errorReason: "settlement_not_configured" }, { status: 503 });
  const client = robinhoodClient(e);
  const v = await verifyPayment(client, body.paymentPayload, body.paymentRequirements);
  if (!v.isValid) return refuse(v.invalidReason, v.payer, v.retryable ? 503 : 200);
  // `to` equals the required payTo once verified.
  if (!(await isListedPayee(e, getAddress(body.paymentPayload.payload.authorization.to)))) return refuse("pay_to_not_listed", v.payer);
  return Response.json(await settlePayment(client, sw.wallet, sw.account, body.paymentPayload));
}
