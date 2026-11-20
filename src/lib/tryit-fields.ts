/**
 * Try it inputs: one field per query parameter of the seller's example request, pre-filled
 * with the example value. The field kind is read from the example itself, so every listing
 * gets editable inputs without the seller configuring anything.
 *
 * Pure: shared by the Try it component and its tests.
 */

export type FieldKind = "wallet" | "address" | "number" | "text";

export interface TryField {
  key: string;
  example: string;
  kind: FieldKind;
  label: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
/** Parameter names that mean "a wallet", so the visitor's own address is the natural value. */
const WALLET_NAME = /^(wallet|owner|account|holder|user|address|from|payer|borrower|addr)$/i;

export function fieldKind(key: string, example: string): FieldKind {
  if (ADDRESS.test(example.trim())) return WALLET_NAME.test(key) ? "wallet" : "address";
  if (NUMBER.test(example.trim())) return "number";
  return "text";
}

/** "sizeUsdg" → "Size usdg", "token_address" → "Token address". */
export function fieldLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

export function tryFields(query: Record<string, string>): TryField[] {
  return Object.entries(query).map(([key, example]) => ({ key, example, kind: fieldKind(key, example), label: fieldLabel(key) }));
}

/** An error to show under the field, or null when the value can be sent. Empty values are left out of the URL. */
export function validateField(f: TryField, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if ((f.kind === "wallet" || f.kind === "address") && !ADDRESS.test(v)) return "Must be a 0x address: 0x followed by 40 hex characters.";
  if (f.kind === "number" && !NUMBER.test(v)) return "Must be a number.";
  return null;
}

/** Same limit as the gateway's MAX_BODY (src/lib/gateway/handle.ts): checked in the browser before signing. */
export const MAX_FILE_BYTES = 1_000_000;

export function fileError(f: { size: number } | null): string | null {
  if (!f) return "Pick a file first.";
  if (f.size === 0) return "That file is empty.";
  if (f.size > MAX_FILE_BYTES) return `That file is ${formatBytes(f.size)}. The limit is 1 MB.`;
  return null;
}

/** An error for the JSON body box, or null. Empty is sent as {}. */
export function jsonBodyError(text: string): string | null {
  if (!text.trim()) return null;
  try { JSON.parse(text); return null; } catch { return "The body must be valid JSON."; }
}

export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${Math.round(n / 100) / 10} KB`;
  return `${Math.round(n / 10_000) / 100} MB`;
}

/** `/g/<slug><path>?<the visitor's values>`; empty values are dropped. */
/** `base`: where the call goes; the x402Fi gateway unless a native listing passes its Try it route. */
export function buildTryUrl(slug: string, path: string, fields: TryField[], values: Record<string, string>, base = `/g/${slug}`): string {
  const q = new URLSearchParams();
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim();
    if (v) q.set(f.key, v);
  }
  const s = q.toString();
  return `${base}${path}${s ? `?${s}` : ""}`;
}
