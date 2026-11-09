import { decodeEventLog, getAddress, isAddress, type Account, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { NETWORK } from "../chains";
import { splitSig } from "./facilitator";
import type { PaymentPayload, SettleResponse } from "./types";

/**
 * "Label registrar" settlement: a contract that sells a label (e.g. a name) for a
 * signed USDG authorization, in one transaction. HoodfiX402Registrar implements it:
 *
 *   quote(string label) view returns (uint256 price, uint8 status, bool available)
 *   registerWithAuthorization(string label, (address from, uint256 value, uint256 validAfter,
 *                             uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s))
 *
 * The buyer's authorization is an ordinary x402 "exact" TransferWithAuthorization whose
 * `to` (payTo) is the contract, so standard x402 clients can pay it unchanged.
 */
export const labelRegistrarAbi = [
  {
    type: "function", name: "quote", stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "price", type: "uint256" }, { name: "status", type: "uint8" }, { name: "available", type: "bool" }],
  },
  {
    type: "function", name: "registerWithAuthorization", stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      {
        name: "auth", type: "tuple",
        components: [
          { name: "from", type: "address" }, { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" }, { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "event", name: "X402Registration",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "node", type: "bytes32", indexed: true },
      { name: "label", type: "string", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "nonce", type: "bytes32", indexed: false },
    ],
  },
] as const;

/** Most gas x402Fi will spend settling one contract call (HoodFi registration ≈ 396k). */
export const CONTRACT_SETTLE_GAS_CAP = 600_000n;

export interface ContractConfig {
  address: Address;
  kind: "label-registrar";
  /** Shown in responses, e.g. ".hoodfi.eth" → "alice.hoodfi.eth". */
  labelSuffix?: string;
}

export function parseContractConfig(raw: string | null | undefined): ContractConfig | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<ContractConfig>;
    if (c.kind !== "label-registrar" || typeof c.address !== "string" || !isAddress(c.address)) return null;
    const suffix = typeof c.labelSuffix === "string" && /^\.[a-z0-9.-]{1,60}$/.test(c.labelSuffix) ? c.labelSuffix : undefined;
    return { address: getAddress(c.address), kind: "label-registrar", labelSuffix: suffix };
  } catch {
    return null;
  }
}

/** Registrar status codes (HoodfiRegistrar.status) as buyer-facing text. */
export const LABEL_STATUS: Record<number, string> = {
  1: "That name is already taken.",
  2: "That name is locked (short names are not open yet).",
  3: "That is not a valid name. Use lowercase letters, numbers and hyphens.",
  4: "That name is reserved and cannot be registered.",
};

export type ContractQuote = { ok: true; amountAtomic: bigint } | { ok: false; unavailable: true; status: number; message: string } | { ok: false; unavailable: false; reason: string };

export async function quoteLabel(client: PublicClient, address: Address, label: string): Promise<ContractQuote> {
  try {
    const [price, status, available] = await client.readContract({ address, abi: labelRegistrarAbi, functionName: "quote", args: [label] });
    if (!available) return { ok: false, unavailable: true, status, message: LABEL_STATUS[status] ?? (status === 0 ? "Registrations are paused right now." : "That name is not available.") };
    return { ok: true, amountAtomic: price };
  } catch (e) {
    return { ok: false, unavailable: false, reason: `quote_failed: ${(e as Error).message.split("\n")[0].slice(0, 120)}` };
  }
}

export type ContractSettle = SettleResponse & { node?: Hex };

/**
 * Settles by calling the contract with the buyer's authorization. Simulated first (a
 * revert costs nothing), capped at CONTRACT_SETTLE_GAS_CAP, and the receipt status is
 * checked: viem does not throw on a mined revert.
 */
export async function settleViaContract(
  client: PublicClient,
  wallet: WalletClient,
  account: Account,
  address: Address,
  label: string,
  payment: PaymentPayload,
): Promise<ContractSettle> {
  const a = payment.payload.authorization;
  const payer = getAddress(a.from);
  const fail = (errorReason: string, transaction: Hex | "" = ""): ContractSettle => ({ success: false, transaction, network: NETWORK, payer, errorReason });
  const { v, r, s } = splitSig(payment.payload.signature);
  const auth = { from: payer, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce, v, r, s };

  let hash: Hex;
  try {
    const gas = await client.estimateContractGas({ account, address, abi: labelRegistrarAbi, functionName: "registerWithAuthorization", args: [label, auth] });
    if (gas > CONTRACT_SETTLE_GAS_CAP) return fail(`gas_above_cap: ${gas}`);
    const { request } = await client.simulateContract({ account, address, abi: labelRegistrarAbi, functionName: "registerWithAuthorization", args: [label, auth], gas: (gas * 12n) / 10n > CONTRACT_SETTLE_GAS_CAP ? CONTRACT_SETTLE_GAS_CAP : (gas * 12n) / 10n });
    hash = await wallet.writeContract({ ...request, account, chain: wallet.chain });
  } catch (e) {
    const err = e as { shortMessage?: string; message?: string };
    return fail(`submit_failed: ${(err.shortMessage ?? err.message ?? "").split("\n")[0].slice(0, 200)}`);
  }
  try {
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") return fail("transaction_reverted", hash);
    let node: Hex | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== address.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: labelRegistrarAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "X402Registration") node = ev.args.node;
      } catch {}
    }
    return { success: true, transaction: hash, network: NETWORK, payer, node };
  } catch {
    return fail("receipt_timeout", hash);
  }
}
