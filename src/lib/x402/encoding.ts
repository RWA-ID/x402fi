/** Base64 JSON helpers for x402 headers. Unicode-safe, no Buffer (Workers + browser). */
export function encodeHeader(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeHeader<T>(header: string): T {
  const bin = atob(header.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** v2 header names, plus the v1 names that many clients still send. */
export const HEADERS = {
  required: "PAYMENT-REQUIRED",
  payment: ["PAYMENT-SIGNATURE", "X-PAYMENT"],
  response: ["PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"],
} as const;
