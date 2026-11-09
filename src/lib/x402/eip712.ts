import { getAddress } from "viem";
import { USDG, ROBINHOOD_CHAIN_ID } from "../chains";

export const transferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const usdgDomain = {
  name: USDG.eip712.name,
  version: USDG.eip712.version,
  chainId: ROBINHOOD_CHAIN_ID,
  verifyingContract: getAddress(USDG.address),
} as const;
