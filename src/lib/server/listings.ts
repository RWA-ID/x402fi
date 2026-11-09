import "server-only";
import { getAddress, isAddress } from "viem";
import { usdToAtomic, MIN_PRICE_ATOMIC, MIN_PRICE_LABEL } from "@/lib/x402/money";

export const CATEGORIES = ["Market data", "AI & agents", "Research", "Compliance & KYB", "Data feeds", "Developer tools", "Other"] as const;
export const METHODS = ["GET", "POST"] as const;

export interface ListingInput {
  name: string;
  summary: string;
  description: string;
  category: string;
  upstreamUrl: string;
  method: string;
  price: string;
  payTo: string;
  dailyCap?: string | null;
  exampleRequest?: string | null;
  exampleResponse?: string | null;
  identityName?: string | null;
}

export type FieldErrors = Partial<Record<keyof ListingInput, string>>;

const NAME_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/;

export function validateListing(i: ListingInput): { ok: true; value: Omit<ListingInput, "price" | "dailyCap"> & { priceAtomic: string; dailyCapAtomic: string | null } } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (s(i.name).length < 3 || s(i.name).length > 60) errors.name = "Use 3 to 60 characters.";
  if (s(i.summary).length < 10 || s(i.summary).length > 140) errors.summary = "One sentence, 10 to 140 characters.";
  if (s(i.description).length > 2000) errors.description = "Keep it under 2,000 characters.";
  if (!CATEGORIES.includes(i.category as (typeof CATEGORIES)[number])) errors.category = "Pick a category.";
  if (!METHODS.includes(i.method as (typeof METHODS)[number])) errors.method = "GET or POST.";
  let priceAtomic = "";
  try {
    const p = usdToAtomic(s(i.price));
    if (p < MIN_PRICE_ATOMIC) errors.price = `Minimum price is ${MIN_PRICE_LABEL}.`;
    else if (p > 1_000_000_000n) errors.price = "Maximum price is $1,000 per call.";
    priceAtomic = p.toString();
  } catch (e) {
    errors.price = (e as Error).message;
  }
  let dailyCapAtomic: string | null = null;
  if (s(i.dailyCap)) {
    try {
      dailyCapAtomic = usdToAtomic(s(i.dailyCap)).toString();
    } catch (e) {
      errors.dailyCap = (e as Error).message;
    }
  }
  let payTo = "";
  if (!isAddress(s(i.payTo), { strict: false })) errors.payTo = "Enter a 0x… address on Robinhood Chain.";
  else payTo = getAddress(s(i.payTo));
  const identityName = s(i.identityName).toLowerCase() || null;
  if (identityName && !NAME_RE.test(identityName)) errors.identityName = "Use a full name like acme.402api.eth.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: s(i.name),
      summary: s(i.summary),
      description: s(i.description),
      category: i.category,
      upstreamUrl: s(i.upstreamUrl),
      method: i.method,
      payTo,
      priceAtomic,
      dailyCapAtomic,
      exampleRequest: s(i.exampleRequest) || null,
      exampleResponse: s(i.exampleResponse) || null,
      identityName,
    },
  };
}

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "service";
}

export function randomToken(bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
