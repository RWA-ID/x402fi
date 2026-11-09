import {
  getAddress,
  isAddressEqual,
  parseSignature,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { NETWORK, USDG } from "../chains";
import { transferWithAuthorizationTypes, usdgDomain } from "./eip712";
export { transferWithAuthorizationTypes, usdgDomain };
import type { PaymentPayload, PaymentRequirements, SettleResponse, VerifyResult } from "./types";

export const usdgAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** Seconds of slack: the authorization must stay valid long enough to land. */
const MIN_VALIDITY_SECONDS = 6n;

const invalid = (invalidReason: string, payer?: Address, retryable = false): VerifyResult => ({
  isValid: false,
  invalidReason,
  payer,
  retryable,
});

/**
 * Checks a payment against what the server asked for. A failed chain read is
 * `retryable` (a 503 to the buyer), never a denial: public RPCs throttle Workers.
 */
export async function verifyPayment(
  client: PublicClient,
  payment: PaymentPayload,
  required: PaymentRequirements,
): Promise<VerifyResult> {
  if (payment?.x402Version !== 2) return invalid("unsupported_x402_version");
  const a = payment.accepted;
  const auth = payment.payload?.authorization;
  const signature = payment.payload?.signature;
  if (!a || !auth || !signature) return invalid("malformed_payload");

  let from: Address, to: Address;
  try {
    from = getAddress(auth.from);
    to = getAddress(auth.to);
  } catch {
    return invalid("malformed_payload");
  }

  if (a.scheme !== "exact" || required.scheme !== "exact") return invalid("unsupported_scheme", from);
  if (a.network !== NETWORK || required.network !== NETWORK) return invalid("invalid_network", from);
  if (!isAddressEqual(a.asset, required.asset) || !isAddressEqual(required.asset, USDG.address)) return invalid("invalid_asset", from);
  if (!isAddressEqual(to, required.payTo) || !isAddressEqual(a.payTo, required.payTo)) return invalid("invalid_pay_to", from);

  let value: bigint, validAfter: bigint, validBefore: bigint;
  try {
    value = BigInt(auth.value);
    validAfter = BigInt(auth.validAfter);
    validBefore = BigInt(auth.validBefore);
  } catch {
    return invalid("malformed_payload", from);
  }
  if (value !== BigInt(required.amount)) return invalid("invalid_amount", from);
  if (!/^0x[0-9a-fA-F]{64}$/.test(auth.nonce)) return invalid("malformed_payload", from);

  let step = "getBlock";
  try {
    // Chain time, not Date.now(): this Mac's clock has run 29s slow before.
    const block = await client.getBlock({ blockTag: "latest" });
    const now = block.timestamp;
    if (validBefore < now + MIN_VALIDITY_SECONDS) return invalid("authorization_expired", from);
    if (validAfter > now) return invalid("authorization_not_yet_valid", from);

    const message = { from, to, value, validAfter, validBefore, nonce: auth.nonce };
    step = "verifyTypedData";
    const sigOk = await client.verifyTypedData({
      address: from,
      domain: usdgDomain,
      types: transferWithAuthorizationTypes,
      primaryType: "TransferWithAuthorization",
      message,
      signature,
    });
    if (!sigOk) return invalid("invalid_signature", from);

    step = "authorizationState+balanceOf";
    const [used, balance] = await Promise.all([
      client.readContract({ address: USDG.address, abi: usdgAbi, functionName: "authorizationState", args: [from, auth.nonce] }),
      client.readContract({ address: USDG.address, abi: usdgAbi, functionName: "balanceOf", args: [from] }),
    ]);
    if (used) return invalid("authorization_already_used", from);
    if (balance < value) return invalid("insufficient_funds", from);
  } catch (err) {
    // Logged with the failing call so an outage is diagnosable from `wrangler tail`.
    const e = err as { name?: string; shortMessage?: string; message?: string; details?: string };
    const short = `${step}: ${e.name ?? "Error"} ${(e.shortMessage ?? e.message?.split("\n")[0] ?? "").slice(0, 160)}`;
    console.error("[facilitator] verify failed", short, e.details ?? "");
    return { ...invalid("chain_unavailable", from, true), detail: short } as VerifyResult;
  }
  return { isValid: true, payer: from };
}

export function splitSig(signature: Hex) {
  const { r, s, v, yParity } = parseSignature(signature);
  return { r, s, v: Number(v ?? BigInt(27 + (yParity ?? 0))) };
}

/**
 * Submits the transfer from the settlement wallet and waits for it to be mined.
 * A mined-but-reverted receipt is a failure: viem does not throw on it.
 */
export async function settlePayment(
  client: PublicClient,
  wallet: WalletClient,
  account: Account,
  payment: PaymentPayload,
): Promise<SettleResponse> {
  const auth = payment.payload.authorization;
  const payer = getAddress(auth.from);
  const fail = (errorReason: string): SettleResponse => ({ success: false, transaction: "", network: NETWORK, payer, errorReason });
  const { v, r, s } = splitSig(payment.payload.signature);
  const args = [
    payer,
    getAddress(auth.to),
    BigInt(auth.value),
    BigInt(auth.validAfter),
    BigInt(auth.validBefore),
    auth.nonce,
    v,
    r,
    s,
  ] as const;

  let hash: Hex;
  try {
    const { request } = await client.simulateContract({
      account,
      address: USDG.address,
      abi: usdgAbi,
      functionName: "transferWithAuthorization",
      args,
    });
    hash = await wallet.writeContract({ ...request, account, chain: wallet.chain });
  } catch (e) {
    return fail(`submit_failed: ${(e as Error).message.split("\n")[0].slice(0, 160)}`);
  }
  try {
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") return { ...fail("transaction_reverted"), transaction: hash };
  } catch {
    return { ...fail("receipt_timeout"), transaction: hash };
  }
  return { success: true, transaction: hash, network: NETWORK, payer };
}
