import { describe, it, expect } from "vitest";
import { verifyTypedData, type PublicClient, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { usdToAtomic, atomicToUsd, formatUsd } from "@/lib/x402/money";
import { buildPaymentRequired } from "@/lib/x402/requirements";
import { verifyPayment, facilitatorPolicyReason, usdgDomain, transferWithAuthorizationTypes, splitSig } from "@/lib/x402/facilitator";
import { encodeHeader, decodeHeader } from "@/lib/x402/encoding";
import type { PaymentPayload } from "@/lib/x402/types";

const NOW = 1_800_000_000n;
const seller = "0x1111111111111111111111111111111111111111" as const;

function fakeClient(opts: { used?: boolean; balance?: bigint; fail?: boolean } = {}): PublicClient {
  return {
    getBlock: async () => {
      if (opts.fail) throw new Error("429");
      return { timestamp: NOW };
    },
    verifyTypedData: (args: Parameters<typeof verifyTypedData>[0]) => verifyTypedData(args),
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "authorizationState" ? (opts.used ?? false) : (opts.balance ?? 10_000_000n),
  } as unknown as PublicClient;
}

async function signedPayment(over: Partial<{ value: bigint; to: `0x${string}`; validBefore: bigint }> = {}) {
  const account = privateKeyToAccount(generatePrivateKey());
  const pr = buildPaymentRequired({ url: "https://x/g/a", description: "d", amountAtomic: 1000n, payTo: seller });
  const req = pr.accepts[0];
  const message = {
    from: account.address,
    to: over.to ?? seller,
    value: over.value ?? 1000n,
    validAfter: 0n,
    validBefore: over.validBefore ?? NOW + 100n,
    nonce: ("0x" + "ab".repeat(32)) as Hex,
  };
  const signature = await account.signTypedData({
    domain: usdgDomain,
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message,
  });
  const payment: PaymentPayload = {
    x402Version: 2,
    accepted: req,
    payload: {
      signature,
      authorization: {
        ...message,
        value: message.value.toString(),
        validAfter: "0",
        validBefore: message.validBefore.toString(),
      },
    },
  };
  return { payment, req, account };
}

describe("money", () => {
  it("parses and formats USDG", () => {
    expect(usdToAtomic("$0.001")).toBe(1000n);
    expect(usdToAtomic("12.5")).toBe(12_500_000n);
    expect(atomicToUsd(1000n)).toBe("0.001");
    expect(formatUsd(12_500_000n)).toBe("$12.50");
    expect(formatUsd(1000n)).toBe("$0.001");
    expect(() => usdToAtomic("0.0000001")).toThrow();
    expect(() => usdToAtomic("abc")).toThrow();
  });
});

describe("402 challenge", () => {
  it("is x402 v2 with USDG on 4663 and the payee-name extension", () => {
    const pr = buildPaymentRequired({ url: "u", description: "d", amountAtomic: 5n, payTo: seller, identityName: "acme.402api.eth" });
    expect(pr.x402Version).toBe(2);
    expect(pr.accepts[0]).toMatchObject({ scheme: "exact", network: "eip155:4663", amount: "5", extra: { name: "Global Dollar", version: "1" } });
    expect(pr.extensions).toEqual({ "payee-name": { info: { name: "acme.402api.eth" } } });
    expect(decodeHeader(encodeHeader(pr))).toEqual(pr);
  });
});

describe("verifyPayment", () => {
  it("accepts a correct signed authorization", async () => {
    const { payment, req, account } = await signedPayment();
    expect(await verifyPayment(fakeClient(), payment, req)).toEqual({ isValid: true, payer: account.address });
  });
  it("rejects a wrong amount, payee, expiry, reuse and low balance", async () => {
    const cases: Array<[Promise<Awaited<ReturnType<typeof signedPayment>>>, PublicClient, string]> = [
      [signedPayment({ value: 999n }), fakeClient(), "invalid_amount"],
      [signedPayment({ to: "0x2222222222222222222222222222222222222222" }), fakeClient(), "invalid_pay_to"],
      [signedPayment({ validBefore: NOW + 2n }), fakeClient(), "authorization_expired"],
      [signedPayment(), fakeClient({ used: true }), "authorization_already_used"],
      [signedPayment(), fakeClient({ balance: 1n }), "insufficient_funds"],
    ];
    for (const [p, c, reason] of cases) {
      const { payment, req } = await p;
      expect(await verifyPayment(c, payment, req)).toMatchObject({ isValid: false, invalidReason: reason });
    }
  });
  it("rejects a tampered signature", async () => {
    const { payment, req } = await signedPayment();
    payment.payload.authorization.value = "2000";
    const r = await verifyPayment(fakeClient(), payment, { ...req, amount: "2000" });
    expect(r).toMatchObject({ isValid: false });
  });
  it("treats an RPC failure as retryable, not a denial", async () => {
    const { payment, req } = await signedPayment();
    expect(await verifyPayment(fakeClient({ fail: true }), payment, req)).toMatchObject({ isValid: false, invalidReason: "chain_unavailable", retryable: true });
  });
  it("asks a gateway payment to outlast the seller's call, and reports the balance it read", async () => {
    const { payment, req } = await signedPayment({ validBefore: NOW + 30n });
    expect(await verifyPayment(fakeClient(), payment, req)).toMatchObject({ isValid: true });
    expect(await verifyPayment(fakeClient(), payment, req, { minValiditySeconds: 40n })).toMatchObject({ isValid: false, invalidReason: "authorization_expired" });
    const long = await signedPayment({ validBefore: NOW + 40n });
    const out: { balance?: bigint } = {};
    expect(await verifyPayment(fakeClient({ balance: 77n * 1000n }), long.payment, long.req, { minValiditySeconds: 40n, out })).toMatchObject({ isValid: true });
    expect(out.balance).toBe(77_000n);
  });
  it("does not throw on missing requirements", async () => {
    const { payment } = await signedPayment();
    expect(await verifyPayment(fakeClient(), payment, undefined as never)).toMatchObject({ isValid: false, invalidReason: "malformed_payload" });
  });
  it("splits a signature into v/r/s", async () => {
    const { payment } = await signedPayment();
    const { v } = splitSig(payment.payload.signature);
    expect([27, 28]).toContain(v);
  });
});

describe("public facilitator policy", () => {
  const withAuth = (over: Record<string, string>) => ({
    x402Version: 2, accepted: {}, payload: { signature: "0x", authorization: { from: "0x3333333333333333333333333333333333333333", to: seller, value: "10000", validAfter: "0", validBefore: "1", nonce: "0x", ...over } },
  }) as unknown as PaymentPayload;
  it("refuses transfers that pay nobody, before any chain read", () => {
    expect(facilitatorPolicyReason(withAuth({ value: "0" }))).toBe("amount_below_minimum");
    expect(facilitatorPolicyReason(withAuth({ value: "9999" }))).toBe("amount_below_minimum");
    expect(facilitatorPolicyReason(withAuth({ to: "0x3333333333333333333333333333333333333333" }))).toBe("self_transfer");
    expect(facilitatorPolicyReason(withAuth({ value: "-1" }))).toBe("amount_below_minimum");
    expect(facilitatorPolicyReason(withAuth({ value: "abc" }))).toBe("malformed_payload");
    expect(facilitatorPolicyReason(withAuth({ to: "nope" }))).toBe("malformed_payload");
    expect(facilitatorPolicyReason(undefined)).toBe("malformed_payload");
    expect(facilitatorPolicyReason({} as PaymentPayload)).toBe("malformed_payload");
  });
  it("lets an ordinary payment through", () => {
    expect(facilitatorPolicyReason(withAuth({}))).toBeNull();
    expect(facilitatorPolicyReason(withAuth({ value: "10000" }))).toBeNull();
  });
});
