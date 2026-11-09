import { discoveryFeed } from "@/lib/server/discovery";

/** Bazaar-style discovery feed (JSON). Human-readable view: /discovery */
export async function GET(req: Request) {
  return Response.json(await discoveryFeed(new URL(req.url).origin));
}
