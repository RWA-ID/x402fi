import { currentSeller } from "@/lib/server/session";

export async function GET() {
  return Response.json({ address: await currentSeller().catch(() => null) });
}
