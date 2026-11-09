import { verifyPayment } from "@/lib/x402/facilitator";
import { robinhoodClient } from "@/lib/server/clients";
import { envAsync } from "@/lib/server/env";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402/types";

/** Public x402 facilitator for Robinhood Chain (USDG, scheme "exact"). */
export async function POST(req: Request) {
  let body: { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements };
  try {
    body = await req.json();
  } catch {
    return Response.json({ isValid: false, invalidReason: "malformed_request" }, { status: 400 });
  }
  const r = await verifyPayment(robinhoodClient(await envAsync()), body.paymentPayload, body.paymentRequirements);
  return Response.json(r, { status: r.isValid ? 200 : "retryable" in r && r.retryable ? 503 : 200 });
}
