import { destroySession } from "@/lib/server/session";

export async function POST() {
  await destroySession();
  return Response.json({ ok: true });
}
