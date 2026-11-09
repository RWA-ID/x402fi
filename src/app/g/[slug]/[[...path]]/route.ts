import { handleGateway } from "@/lib/gateway/handle";

type Ctx = { params: Promise<{ slug: string; path?: string[] }> };

async function handler(req: Request, { params }: Ctx) {
  const { slug, path = [] } = await params;
  return handleGateway(req, slug, path);
}

export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const dynamic = "force-dynamic";
