import { describe, expect, it, vi, beforeEach } from "vitest";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, labelhash, namehash, type Address } from "viem";

vi.mock("server-only", () => ({}));

type Read = { address: string; functionName: string; args: readonly unknown[] };
let table: (r: Read) => unknown;
const client = { readContract: async (r: Read) => { const v = table(r); if (v instanceof Error) throw v; return v; } };
vi.mock("@/lib/server/clients", () => ({ mainnetClient: () => client, robinhoodClient: () => client }));

const { nameHolders, sellerHoldsNameError } = await import("@/lib/server/nameHolder");

const REG = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const NW = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const BR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85";
const V2 = "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2";
const HOODFI = "0xf2bABA012244bdD7445129597350054E1B3aEe5C";
const ZERO = "0x0000000000000000000000000000000000000000";
const A = "0xAC50cE326de14dDF9b7e9611Cd2F33a1Af8aC039" as Address;
const B = "0xDa021A2C1C2F99574D861Ef8c6fA745851BEB7F6" as Address;
const C = "0x17F74532A45e7B16a9620E4BC84924916a9cF45A" as Address;

const revert = () =>
  new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi: [], functionName: "ownerOf", message: "reverted" }), { abi: [], functionName: "ownerOf" });
const env = {} as never;
const key = (r: Read) => `${r.address.toLowerCase()}:${r.functionName}:${String(r.args[0])}`;
const make = (m: Record<string, unknown>) => (r: Read) => (key(r) in m ? m[key(r)] : (() => { throw new Error(`unexpected read ${key(r)}`); })());
const k = (addr: string, fn: string, arg: unknown) => `${addr.toLowerCase()}:${fn}:${String(arg)}`;

describe("nameHolders", () => {
  beforeEach(() => { table = () => { throw new Error("no table"); }; });

  it("a v2 name answers from the v2 registry, ignoring stale v1 rows", async () => {
    const id = BigInt(labelhash("crustacean"));
    table = make({ [k(V2, "getStatus", id)]: 2, [k(V2, "getTokenId", id)]: id + 7n, [k(V2, "ownerOf", id + 7n)]: A });
    expect(await nameHolders(env, "crustacean.eth")).toEqual({ state: "held", holders: [A] });
  });

  it("a v1 2LD counts registrant and manager", async () => {
    const id = BigInt(labelhash("coinbase"));
    table = make({ [k(V2, "getStatus", id)]: 1, [k(BR, "ownerOf", id)]: C, [k(REG, "owner", namehash("coinbase.eth"))]: B });
    expect(await nameHolders(env, "coinbase.eth")).toEqual({ state: "held", holders: [C, B] });
  });

  it("an expired v1 2LD (registrar reverts) has no holder, even with a registry row", async () => {
    const id = BigInt(labelhash("old"));
    table = make({ [k(V2, "getStatus", id)]: 1, [k(BR, "ownerOf", id)]: revert(), [k(REG, "owner", namehash("old.eth"))]: B });
    expect(await nameHolders(env, "old.eth")).toEqual({ state: "none" });
  });

  it("an x402 Identity subname reads the NameWrapper", async () => {
    const node = namehash("hoodfi.402api.eth");
    table = make({ [k(REG, "owner", node)]: NW, [k(NW, "ownerOf", BigInt(node))]: A });
    expect(await nameHolders(env, "hoodfi.402api.eth")).toEqual({ state: "held", holders: [A] });
  });

  it("a hoodfi name reads Robinhood Chain; never minted = none", async () => {
    table = make({ [k(HOODFI, "ownerOf", BigInt(namehash("stockfi.hoodfi.eth")))]: A, [k(HOODFI, "ownerOf", BigInt(namehash("nope.hoodfi.eth")))]: revert() });
    expect(await nameHolders(env, "stockfi.hoodfi.eth")).toEqual({ state: "held", holders: [A] });
    expect(await nameHolders(env, "nope.hoodfi.eth")).toEqual({ state: "none" });
  });

  it("a failed read is unknown, not 'not yours'", async () => {
    table = () => new Error("429 Too Many Requests");
    expect(await nameHolders(env, "stockfi.hoodfi.eth")).toEqual({ state: "unknown" });
    expect(await nameHolders(env, "coinbase.eth")).toEqual({ state: "unknown" });
  });

  it("an unregistered subname has no holder", async () => {
    table = make({ [k(REG, "owner", namehash("x.402api.eth"))]: ZERO });
    expect(await nameHolders(env, "x.402api.eth")).toEqual({ state: "none" });
  });
});

describe("sellerHoldsNameError", () => {
  it("allows the holder (any case), refuses anyone else, and retries on a failed read", async () => {
    const id = BigInt(labelhash("coinbase"));
    table = make({ [k(V2, "getStatus", id)]: 1, [k(BR, "ownerOf", id)]: C, [k(REG, "owner", namehash("coinbase.eth"))]: C });
    expect(await sellerHoldsNameError(env, "coinbase.eth", C.toLowerCase() as Address)).toBeNull();
    const no = await sellerHoldsNameError(env, "coinbase.eth", A);
    expect(no?.status).toBe(403);
    expect(no?.error).toContain("coinbase.eth is held by 0x17F7");
    table = () => new Error("timeout");
    expect((await sellerHoldsNameError(env, "coinbase.eth", C))?.status).toBe(503);
  });
});
