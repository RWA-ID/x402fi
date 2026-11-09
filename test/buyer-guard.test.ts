import { describe, it, expect } from "vitest";
import { getAddress, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { evmQuoteFromRequirements, guardEvmSigner } from "wormhole-x402/evm";
import { inspectQuoteText } from "wormhole-x402/quotetext";
import { buildPaymentRequired } from "@/lib/x402/requirements";

/**
 * The buyer recipe on /developers ("Paying safely"), run offline against a 402 exactly as
 * the x402Fi gateway issues it. A throwaway key signs EIP-712 messages only: nothing is
 * broadcast and no funds exist. If AgentWormhole or our 402 shape changes so that the
 * recipe stops working, this fails before a buyer finds out.
 */
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const SELLER = getAddress("0x837Fa2d033f1F7275452D780a5E54Eda903C1330");
const ATTACKER = getAddress("0x000000000000000000000000000000000000dEaD");

const pr = buildPaymentRequired({ url: "https://x402fi.dev/g/demo-quote", description: "A cent buys a signed hello.", amountAtomic: 10_000n, payTo: SELLER });
const req = pr.accepts[0];

const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ],
} as const;

const now = () => BigInt(Math.floor(Date.now() / 1000));
function authorization(from: Hex, over: Partial<{ to: Hex; value: bigint; validBefore: bigint }> = {}) {
  return {
    domain: { name: req.extra!.name as string, version: req.extra!.version as string, chainId: 4663, verifyingContract: getAddress(req.asset) },
    types: TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from, to: over.to ?? getAddress(req.payTo), value: over.value ?? BigInt(req.amount),
      validAfter: now() - 60n, validBefore: over.validBefore ?? now() + BigInt(req.maxTimeoutSeconds),
      nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
    },
  };
}

// The recipe's spending policy: at most $0.05 a call, $1 over the guard's lifetime, USDG only.
const spendPolicy = { maxPerPayment: { [USDG]: "50000" }, maxTotal: { [USDG]: "1000000" } };

function guarded() {
  const account = privateKeyToAccount(generatePrivateKey());
  const quote = evmQuoteFromRequirements({ ...req });
  return { account, signer: guardEvmSigner(account, () => quote, { spendPolicy }) };
}

describe("buyer recipe: AgentWormhole guard on an x402Fi 402", () => {
  it("the 402's own text scans clean", () => {
    expect(inspectQuoteText(pr).decision).toBe("allow");
  });

  it("signs the payment the 402 asked for", async () => {
    const { account, signer } = guarded();
    const sig = await signer.signTypedData(authorization(account.address));
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("refuses to pay anyone but the quoted payee", async () => {
    const { account, signer } = guarded();
    await expect(signer.signTypedData(authorization(account.address, { to: ATTACKER }))).rejects.toThrow(/X402-1\d\d/);
  });

  it("refuses an amount other than the quoted one", async () => {
    const { account, signer } = guarded();
    await expect(signer.signTypedData(authorization(account.address, { value: 20_000n }))).rejects.toThrow(/X402-\d+/);
  });

  it("refuses a quote over the spending cap, even if the payment matches it", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const pricey = evmQuoteFromRequirements({ ...req, amount: "5000000" }); // $5
    const signer = guardEvmSigner(account, () => pricey, { spendPolicy });
    await expect(signer.signTypedData(authorization(account.address, { value: 5_000_000n }))).rejects.toThrow(/X402-501/);
  });

  it("refuses a long-lived authorization", async () => {
    const { account, signer } = guarded();
    await expect(signer.signTypedData(authorization(account.address, { validBefore: now() + 7n * 86400n }))).rejects.toThrow(/X402-105/);
  });

  it("refuses to sign anything else with the wallet (default-deny)", async () => {
    const { signer } = guarded();
    await expect((signer as unknown as { signMessage: (a: unknown) => Promise<Hex> }).signMessage({ message: "approve everything" })).rejects.toThrow();
  });
});
