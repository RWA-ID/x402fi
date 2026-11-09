import { NETWORK } from "@/lib/chains";

export function GET() {
  return Response.json({ kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }], extensions: ["payee-name"] });
}
