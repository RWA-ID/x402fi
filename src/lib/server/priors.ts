import "server-only";
import { isAddress } from "viem";
import { toPriorsRecord, type PriorsRecord } from "@/lib/priors";
import { envAsync } from "./env";

export type { PriorsRecord };

const TTL = 600;
const API = "https://priors.trade/api/check";


export async function priorsRecord(address: string): Promise<PriorsRecord> {
  if (!isAddress(address, { strict: false })) return { state: "none" };
  const e = await envAsync();
  const key = `priors:${address.toLowerCase()}`;
  const hit = await e.KV.get(key, "json").catch(() => null);
  if (hit) return hit as PriorsRecord;
  let rec: PriorsRecord;
  try {
    const r = await fetch(`${API}?address=${address}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6_000) });
    rec = r.ok ? toPriorsRecord((await r.json()) as Parameters<typeof toPriorsRecord>[0]) : { state: "unknown" };
  } catch {
    rec = { state: "unknown" };
  }
  await e.KV.put(key, JSON.stringify(rec), { expirationTtl: rec.state === "unknown" ? 60 : TTL }).catch(() => {});
  return rec;
}
