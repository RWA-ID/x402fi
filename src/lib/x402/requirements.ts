import { getAddress, type Address } from "viem";
import { NETWORK, USDG } from "../chains";
import type { PaymentRequired, PaymentRequirements } from "./types";
import type { BazaarExtension } from "./bazaar";

export interface ChallengeInput {
  url: string;
  description: string;
  mimeType?: string;
  amountAtomic: bigint;
  payTo: Address;
  /** x402 Identity name (e.g. acme.402api.eth); adds the payee-name extension. */
  identityName?: string | null;
  /** How to call the endpoint (x402 Bazaar discovery extension). */
  bazaar?: BazaarExtension;
  error?: string;
}

export function buildRequirements(input: ChallengeInput): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: input.amountAtomic.toString(),
    asset: getAddress(USDG.address),
    payTo: getAddress(input.payTo),
    maxTimeoutSeconds: 120,
    extra: { name: USDG.eip712.name, version: USDG.eip712.version },
  };
}

export function buildPaymentRequired(input: ChallengeInput): PaymentRequired {
  const pr: PaymentRequired = {
    x402Version: 2,
    resource: { url: input.url, description: input.description, mimeType: input.mimeType ?? "application/json" },
    accepts: [buildRequirements(input)],
  };
  if (input.error) pr.error = input.error;
  const extensions: Record<string, unknown> = {};
  if (input.identityName) extensions["payee-name"] = { info: { name: input.identityName } };
  if (input.bazaar) extensions.bazaar = input.bazaar;
  if (Object.keys(extensions).length) pr.extensions = extensions;
  return pr;
}
