"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { txUrl } from "@/lib/chains";

export interface PaidResponse {
  /** Exact bytes delivered, so a saved file hashes to the receipt's fingerprint. */
  bytes: Uint8Array;
  contentType: string;
  status: number;
  /** e.g. "Paid 0.02 USDG" or "Free, no payment". */
  paidLabel: string;
  request: string;
  transaction?: string;
  receiptPage?: string;
  /** SHA-256 the gateway put on the receipt (x-x402fi-response-sha256). */
  receiptSha256?: string;
}

type Tab = "card" | "json";

/** Popup for a Try it response: a readable card, the raw JSON, and copy / save. */
export function ResponseCard({ open, onClose, response, fileBase }: { open: boolean; onClose: () => void; response: PaidResponse; fileBase: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const text = useMemo(() => new TextDecoder().decode(response.bytes), [response.bytes]);
  const parsed = useMemo(() => { try { return { ok: true as const, value: JSON.parse(text) as unknown }; } catch { return { ok: false as const }; } }, [text]);
  const [tab, setTab] = useState<Tab>(parsed.ok ? "card" : "json");
  const [copied, setCopied] = useState(false);
  const [sha, setSha] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    let live = true;
    crypto.subtle.digest("SHA-256", response.bytes as BufferSource).then((h) => {
      if (live) setSha([...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    }).catch(() => {});
    return () => { live = false; };
  }, [response.bytes]);

  const pretty = parsed.ok ? JSON.stringify(parsed.value, null, 2) : text;
  const match = sha && response.receiptSha256 ? sha === response.receiptSha256.toLowerCase() : null;

  function save() {
    const ext = parsed.ok ? "json" : "txt";
    const blob = new Blob([response.bytes as BlobPart], { type: parsed.ok ? "application/json" : response.contentType || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(pretty); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-line bg-bg p-0 text-ink shadow-2xl backdrop:bg-[rgba(20,32,20,0.45)]"
      aria-labelledby="response-card-title"
    >
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow">Response · {response.status}</div>
            <h2 id="response-card-title" className="mt-1 font-serif text-xl">{response.paidLabel}</h2>
            <p className="mt-1 truncate font-mono text-xs text-ink-3" title={response.request}>{response.request}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost shrink-0 px-3 py-1.5" aria-label="Close">✕</button>
        </header>

        {parsed.ok && (
          <div className="flex gap-1 border-b border-line px-5 pt-3" role="tablist">
            {(["card", "json"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm ${tab === t ? "border-forest font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
                {t === "card" ? "Card" : "JSON"}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {tab === "card" && parsed.ok ? (
            <JsonCard value={parsed.value} />
          ) : (
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-elev p-3 font-mono text-[0.75rem]">{pretty.slice(0, 200_000)}</pre>
          )}
        </div>

        <footer className="space-y-3 border-t border-line px-5 py-4">
          {sha && (
            <div className="text-xs">
              <span className="text-ink-3">SHA-256 </span>
              <code className="break-all font-mono">{sha}</code>
              {match === true && <span className="ml-2 font-medium text-good">✓ matches the receipt</span>}
              {match === false && <span className="ml-2 font-medium text-bad">✕ does not match the receipt</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} className="btn btn-primary px-4 py-2 text-sm">Save {parsed.ok ? ".json" : "file"}</button>
            <button onClick={copy} className="btn btn-ghost px-4 py-2 text-sm">{copied ? "Copied" : parsed.ok ? "Copy JSON" : "Copy"}</button>
            <span className="flex-1" />
            {response.transaction && <a href={txUrl(response.transaction)} target="_blank" rel="noreferrer" className="text-sm underline">Transaction</a>}
            {response.receiptPage && <a href={response.receiptPage} target="_blank" rel="noreferrer" className="text-sm underline">Receipt</a>}
          </div>
        </footer>
      </div>
    </dialog>
  );
}

/* ---------- generic JSON → card ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
const HEADLINE = ["verdict", "status", "result", "outcome", "state"];
const TITLE_KEYS = ["code", "name", "title", "symbol", "id", "label"];
const LONG = 160;

function tone(v: string): "good" | "warn" | "bad" | "neutral" {
  const s = v.toLowerCase();
  if (/^(go|ok|pass|passed|success|succeeded|settled|active|live|true|yes)$/.test(s) || s.endsWith("_active")) return "good";
  if (/^(stop|fail|failed|error|denied|rejected|halted|false|no)$/.test(s)) return "bad";
  if (/^(caution|warn|warning|pending|partial|unknown|unavailable)$/.test(s)) return "warn";
  return "neutral";
}
const TONE_CLS = { good: "bg-good text-[#f3f1ec]", warn: "bg-warn text-[#f3f1ec]", bad: "bg-bad text-[#f3f1ec]", neutral: "bg-card text-ink" };

function humanKey(k: string) {
  const s = k.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Badge({ v }: { v: string }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-xs font-medium ${TONE_CLS[tone(v)]}`}>{v}</span>;
}

function Scalar({ k, v }: { k?: string; v: unknown }): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-ink-3">—</span>;
  if (typeof v === "boolean") return <span className={v ? "text-good" : "text-ink-2"}>{v ? "Yes" : "No"}</span>;
  if (typeof v === "number") {
    const unix = k && /(at|time|timestamp)$/i.test(k) && v > 1e9 && v < 1e11;
    return <span className="font-mono">{v.toLocaleString()}{unix && <span className="ml-2 text-ink-3">{new Date(v * 1000).toISOString().replace(".000Z", "Z")}</span>}</span>;
  }
  const s = String(v);
  if (/^0x[0-9a-fA-F]{40,}$/.test(s)) return <code className="break-all font-mono text-xs" title={s}>{s}</code>;
  if (/^https?:\/\//.test(s)) return <a href={s} target="_blank" rel="noreferrer" className="break-all underline">{s}</a>;
  if (k && /(severity|status|verdict|level|kind)$/i.test(k) && s.length < 40) return <Badge v={s} />;
  return <span className="break-words">{s}</span>;
}

function Rows({ obj }: { obj: Obj }) {
  const entries = Object.entries(obj);
  if (!entries.length) return <p className="text-sm text-ink-3">Empty</p>;
  return (
    <dl className="divide-y divide-line">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 gap-1 py-2 text-sm sm:grid-cols-[minmax(8rem,38%)_1fr] sm:gap-3">
          <dt className="text-ink-3">{humanKey(k)}</dt>
          <dd className="min-w-0"><Value k={k} v={v} /></dd>
        </div>
      ))}
    </dl>
  );
}

function Value({ k, v }: { k?: string; v: unknown }): ReactNode {
  if (isScalar(v)) return <Scalar k={k} v={v} />;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-ink-3">None</span>;
    if (v.every(isScalar)) return <span className="flex flex-wrap gap-1">{v.map((x, i) => <span key={i} className="rounded bg-card px-1.5 py-0.5 font-mono text-xs">{String(x)}</span>)}</span>;
    return <ItemList items={v} />;
  }
  if (isObj(v)) return <div className="rounded-lg border border-line px-3"><Rows obj={v} /></div>;
  return <Scalar v={String(v)} />;
}

function ItemList({ items }: { items: unknown[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        if (!isObj(it)) return <li key={i}><Value v={it} /></li>;
        const tk = TITLE_KEYS.find((t) => typeof it[t] === "string");
        const badgeKey = Object.keys(it).find((t) => /^(severity|status|level)$/i.test(t) && typeof it[t] === "string");
        const detailKey = Object.keys(it).find((t) => /^(detail|message|description|reason|note)$/i.test(t) && typeof it[t] === "string");
        const rest = Object.fromEntries(Object.entries(it).filter(([key]) => key !== tk && key !== badgeKey && key !== detailKey));
        return (
          <li key={i} className="rounded-lg border border-line bg-elev p-3">
            {(tk || badgeKey) && (
              <div className="flex flex-wrap items-center gap-2">
                {badgeKey && <Badge v={it[badgeKey] as string} />}
                {tk && <span className="font-mono text-sm font-medium">{it[tk] as string}</span>}
              </div>
            )}
            {detailKey && <p className="mt-1 text-sm text-ink-2">{it[detailKey] as string}</p>}
            {Object.keys(rest).length > 0 && <div className="mt-1"><Rows obj={rest} /></div>}
          </li>
        );
      })}
    </ul>
  );
}

function JsonCard({ value }: { value: unknown }) {
  if (!isObj(value)) return <Value v={value} />;
  const headKey = HEADLINE.find((k) => typeof value[k] === "string" && (value[k] as string).length < 40);
  const entries = Object.entries(value).filter(([k]) => k !== headKey);
  const scalars = entries.filter(([, v]) => isScalar(v) && !(typeof v === "string" && v.length > LONG));
  const notes = entries.filter(([, v]) => typeof v === "string" && v.length > LONG) as [string, string][];
  // Lists (reasons, warnings, items) read first; then nested objects, in key order.
  const sections = entries.filter(([, v]) => !isScalar(v)).sort(([, a], [, b]) => Number(isObj(a)) - Number(isObj(b)));

  return (
    <div className="space-y-5">
      {headKey && (
        <div className="flex items-center gap-3">
          <span className="eyebrow">{humanKey(headKey)}</span>
          <span className={`rounded-lg px-3 py-1 font-mono text-lg font-semibold ${TONE_CLS[tone(value[headKey] as string)]}`}>{value[headKey] as string}</span>
        </div>
      )}
      {scalars.length > 0 && <section><Rows obj={Object.fromEntries(scalars)} /></section>}
      {sections.map(([k, v]) => (
        <section key={k}>
          <h3 className="eyebrow mb-2">{humanKey(k)}</h3>
          {isObj(v) ? <div className="rounded-lg border border-line px-3"><Rows obj={v} /></div> : <Value k={k} v={v} />}
        </section>
      ))}
      {notes.map(([k, v]) => <p key={k} className="text-xs leading-relaxed text-ink-3"><span className="font-medium">{humanKey(k)}: </span>{v}</p>)}
    </div>
  );
}
