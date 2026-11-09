import { inspectQuoteText } from "wormhole-x402/quotetext";

/**
 * Listing text scan, using AgentWormhole's quote-text rules (wormhole-x402, Apache-2.0).
 *
 * Everything a seller writes on a listing (name, summary, description, examples, and a
 * native endpoint's own 402 description) ends up in front of buying agents: in our 402
 * responses, the discovery API and the market pages. That makes it an injection channel
 * x402Fi itself hosts. This scans it offline (no network, no model) before it goes out.
 *
 * The scan is shape matching over text and is evadable by rewording; it catches the
 * careless injection, it does not certify a listing as safe. Never show "scanned clean"
 * to buyers as a trust signal.
 *
 * Modes (env LISTING_TEXT_SCAN):
 *   off   (default) nothing runs
 *   flag  every write is scanned; results are stored on the listing and logged, nothing is blocked
 *   block like flag, and a write whose text is refused gets a 422 naming the field
 */
export type ScanMode = "off" | "flag" | "block";

/** Bump together with the pinned wormhole-x402 version (a test checks they match). */
export const SCANNER = "wormhole-x402@0.11.0";

export function scanMode(v: unknown): ScanMode {
  return v === "flag" || v === "block" ? v : "off";
}

export interface TextScanFinding {
  field: string;
  code: string;
  severity: string;
  message: string;
  excerpt?: string;
  via?: string;
}

export interface TextScanResult {
  decision: "allow" | "refuse" | "abstain";
  findings: TextScanFinding[];
  scanner: string;
  scannedAt: number;
}

/**
 * Scans each non-empty field on its own, so a finding names our field ("description"),
 * not the scanner's path for a bare string. Refuse beats abstain beats allow. An abstain
 * (the scanner could not read a field) is never reported as clean: it is kept as a finding.
 */
export function scanFields(fields: Record<string, string | null | undefined>, now = Date.now()): TextScanResult {
  const findings: TextScanFinding[] = [];
  let refused = false;
  let abstained = false;
  for (const [field, raw] of Object.entries(fields)) {
    const text = typeof raw === "string" ? raw : "";
    if (!text.trim()) continue;
    let v: ReturnType<typeof inspectQuoteText>;
    try {
      v = inspectQuoteText(text);
    } catch (e) {
      abstained = true;
      findings.push({ field, code: "SCAN_ERROR", severity: "high", message: `the scanner threw: ${(e as Error).message}` });
      continue;
    }
    if (v.decision === "refuse") refused = true;
    if (v.decision === "abstain") {
      abstained = true;
      findings.push({ field, code: "ABSTAIN", severity: "high", message: v.reason ?? "the scanner could not read this field" });
    }
    for (const f of v.findings) {
      findings.push({ field, code: f.code, severity: f.severity, message: f.message, excerpt: f.excerpt?.slice(0, 160), via: f.via });
    }
  }
  return { decision: refused ? "refuse" : abstained ? "abstain" : "allow", findings, scanner: SCANNER, scannedAt: Math.floor(now / 1000) };
}

/**
 * Seller-facing errors for block mode: one message per refused field, keyed by the
 * form field the seller can fix. `fieldKey` maps a scan field to its form field.
 */
export function blockErrors(r: TextScanResult, fieldKey: (field: string) => string = (f) => f): Record<string, string> | null {
  if (r.decision !== "refuse") return null;
  const out: Record<string, string> = {};
  for (const f of r.findings) {
    if (f.code === "ABSTAIN" || f.code === "SCAN_ERROR") continue;
    const k = fieldKey(f.field);
    if (!out[k]) out[k] = `This reads like an instruction to AI agents (${f.code}), which listings can't carry. Please rephrase it.`;
  }
  return Object.keys(out).length ? out : null;
}

type ServiceText = { name?: string | null; summary?: string | null; exampleBody?: string | null; exampleRequest?: string | null; exampleResponse?: string | null };

/** Block-mode check for one endpoint's text, keyed by the endpoint form's fields. */
export function serviceBlockErrors(s: ServiceText, nativeDescription: string | null = null): Record<string, string> | null {
  const r = scanFields({
    name: s.name,
    summary: s.summary,
    exampleBody: s.exampleBody,
    exampleRequest: s.exampleRequest,
    exampleResponse: s.exampleResponse,
    nativeDescription,
  });
  return blockErrors(r, (f) => (f === "nativeDescription" ? "path" : f));
}
