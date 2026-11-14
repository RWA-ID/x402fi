import { siteCardImage } from "@/lib/server/og";

/** 1200x630 share card for the site: the homepage hero. Referenced by the root layout's og:image. */
export async function GET(req: Request) {
  return siteCardImage(new URL(req.url).origin);
}
