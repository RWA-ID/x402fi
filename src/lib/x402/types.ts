import type { Address, Hex } from "viem";

/** One way to pay, x402 v2. */
export interface PaymentRequirements {
  scheme: "exact";
  network: string; // CAIP-2
  amount: string; // atomic units
  asset: Address;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export interface ResourceInfo {
  url: string;
  description: string;
  mimeType: string;
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export interface PaymentPayload {
  x402Version: 2;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: { signature: Hex; authorization: Authorization };
  extensions?: Record<string, unknown>;
}

export interface SettleResponse {
  success: boolean;
  transaction: Hex | "";
  network: string;
  payer: Address;
  errorReason?: string;
}

export type VerifyResult =
  | { isValid: true; payer: Address }
  | { isValid: false; invalidReason: string; payer?: Address; retryable?: boolean; detail?: string };
