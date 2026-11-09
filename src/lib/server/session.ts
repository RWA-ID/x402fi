import "server-only";
import { cookies } from "next/headers";
import { getAddress, type Address } from "viem";
import { envAsync } from "./env";

const COOKIE = "x402fi_session";
const MAX_AGE = 60 * 60 * 24 * 7;

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function secret() {
  const s = (await envAsync()).SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

export async function createSession(address: Address) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const body = `${getAddress(address)}.${exp}`;
  const value = `${body}.${await hmac(await secret(), body)}`;
  (await cookies()).set(COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in seller's address, or null. */
export async function currentSeller(): Promise<Address | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [addr, exp, sig] = raw.split(".");
  if (!addr || !exp || !sig) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const expected = await hmac(await secret(), `${addr}.${exp}`);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    return getAddress(addr);
  } catch {
    return null;
  }
}
