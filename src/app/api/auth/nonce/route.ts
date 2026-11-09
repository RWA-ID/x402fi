import { generateSiweNonce } from "viem/siwe";
import { envAsync } from "@/lib/server/env";

export async function GET() {
  const nonce = generateSiweNonce();
  await (await envAsync()).KV.put(`siwe:${nonce}`, "1", { expirationTtl: 600 });
  return Response.json({ nonce });
}
