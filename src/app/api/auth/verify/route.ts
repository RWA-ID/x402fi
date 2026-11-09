import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { createPublicClient, http, getAddress, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { envAsync, db } from "@/lib/server/env";
import { createSession } from "@/lib/server/session";
import { sellers } from "@/db/schema";

export async function POST(req: Request) {
  const { message, signature } = (await req.json()) as { message: string; signature: Hex };
  const e = await envAsync();
  const fields = parseSiweMessage(message);
  const host = new URL(req.url).host;
  if (!fields.nonce || !fields.address) return Response.json({ error: "bad message" }, { status: 400 });
  if (!(await e.KV.get(`siwe:${fields.nonce}`))) return Response.json({ error: "Sign-in expired. Try again." }, { status: 401 });
  if (!validateSiweMessage({ message: fields, domain: host })) return Response.json({ error: "Message is for another site." }, { status: 401 });
  // verifySiweMessage handles both EOAs and smart wallets (ERC-1271/6492).
  const client = createPublicClient({ chain: mainnet, transport: http(e.MAINNET_RPC_URL || "https://eth.llamarpc.com") });
  const ok = await client.verifySiweMessage({ message, signature, domain: host }).catch(() => false);
  if (!ok) return Response.json({ error: "Signature did not verify." }, { status: 401 });
  await e.KV.delete(`siwe:${fields.nonce}`);
  const address = getAddress(fields.address);
  await db(e).insert(sellers).values({ address }).onConflictDoNothing();
  await createSession(address);
  return Response.json({ address });
}
