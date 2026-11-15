import { getAddress } from "viem";
import { facilitatorPolicyReason, verifyPayment } from "@/lib/x402/facilitator";
import { robinhoodClient } from "@/lib/server/clients";
import { envAsync } from "@/lib/server/env";
import { isListedPayee } from "@/lib/server/facilitatorPolicy";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402/types";

/**
 * Public x402 facilitator for Robinhood Chain (USDG, scheme "exact"). It answers what
 * /settle would do: the same limits apply (see /settle), so a payment that verifies settles.
 */
export async function POST(req: Request) {
  let body: { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements };
  try {
    body = await req.json();
  } catch {
    return Response.json({ isValid: false, invalidReason: "malformed_request" }, { status: 400 });
  }
  if (!body?.paymentPayload || !body?.paymentRequirements) return Response.json({ isValid: false, invalidReason: "malformed_request" }, { status: 400 });
  const refused = facilitatorPolicyReason(body.paymentPayload);
  if (refused) return Response.json({ isValid: false, invalidReason: refused });
  const e = await envAsync();
  const r = await verifyPayment(robinhoodClient(e), body.paymentPayload, body.paymentRequirements);
  if (!r.isValid) return Response.json(r, { status: "retryable" in r && r.retryable ? 503 : 200 });
  // `to` equals the required payTo once verified.
  if (!(await isListedPayee(e, getAddress(body.paymentPayload.payload.authorization.to)))) {
    return Response.json({ isValid: false, invalidReason: "pay_to_not_listed", payer: r.payer });
  }
  return Response.json(r);
}
