"use client";
import { useState } from "react";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { toHex, getAddress } from "viem";
import { NETWORK, ROBINHOOD_CHAIN_ID, txUrl, USDG } from "@/lib/chains";
import { decodeHeader, encodeHeader } from "@/lib/x402/encoding";
import { transferWithAuthorizationTypes, usdgDomain } from "@/lib/x402/eip712";
import type { PaymentPayload, PaymentRequired, SettleResponse } from "@/lib/x402/types";
import { formatUsd } from "@/lib/x402/money";
import { ResponseCard, type PaidResponse } from "@/components/ResponseCard";
import { buildTryUrl, fileError, formatBytes, jsonBodyError, tryFields, validateField, type TryField } from "@/lib/tryit-fields";
import { TokenField, useStockTokens } from "@/components/TokenField";
import { byAddress, bySymbol, isTickerKey, isTokenAddressKey, type StockToken } from "@/lib/stock-tokens";

/**
 * Which fields get the Stock Token picker: a ticker parameter whose example is a known Stock
 * Token (so a forex "symbol=EURUSD" stays a plain field), and a token-address parameter.
 */
function tokenMode(f: TryField, list: StockToken[] | null): "ticker" | "address" | null {
  if (!list) return null;
  if (f.kind === "text" && isTickerKey(f.key) && bySymbol(list, f.example)) return "ticker";
  if (f.kind === "address" && (isTokenAddressKey(f.key) || byAddress(list, f.example))) return "address";
  return null;
}

type Line = { t: string; tone?: "ok" | "bad" | "dim" };

/**
 * `nameEntry`: a contract endpoint that sells a name. The buyer types it, the URL becomes
 * `/g/<slug><path>/<name>`, and the exact price is shown before the wallet asks to sign.
 * `native`: the seller runs its own paywall. Calls go through /api/try-native/<serviceId> and the
 * buyer pays the seller directly; the wallet is only asked to sign if the live 402 pays `payTo`,
 * the wallet the listing was published with.
 */
export function TryIt({ slug, method, pathAndQuery, params, exampleBody, acceptsFile, pricing, priceLabel, nameEntry, onPaid, popup = true, native }: {
  slug: string; method: string; pathAndQuery: string; pricing: "free" | "fixed" | "quote" | "contract"; priceLabel: string;
  /** The example's query parameters: each becomes an editable field, pre-filled with the example value. */
  params?: Record<string, string>;
  /** POST only: the seller's example JSON body, editable before sending. */
  exampleBody?: string | null;
  /** POST only: the endpoint takes a raw file as its body; a file picker replaces the JSON box. */
  acceptsFile?: boolean;
  /** `initial` pre-fills the name; `locked` hides the input (the caller already chose it). */
  nameEntry?: { suffix?: string; initial?: string; locked?: boolean; cta?: string };
  /** Called with the parsed JSON response after a successful paid call (e.g. a registered name). */
  onPaid?: (body: unknown) => void;
  /** Open the response in a popup card on success (off for flows that move on by themselves). */
  popup?: boolean;
  native?: { serviceId: string; payTo: string };
}) {
  const [name, setName] = useState(nameEntry?.initial ?? "");
  const [fields] = useState(() => tryFields(params ?? {}));
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(params ?? {}) }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Only listings with a ticker or address field load the Stock Token list.
  const stockTokens = useStockTokens(fields.some((f) => (f.kind === "text" && isTickerKey(f.key)) || f.kind === "address"));
  const hasBody = method === "POST" && !nameEntry;
  const fileMode = hasBody && !!acceptsFile;
  const [jsonBody, setJsonBody] = useState(() => pretty(exampleBody?.trim() || "{}"));
  const [file, setFile] = useState<File | null>(null);
  const pickFile = (f: File | null) => {
    setFile(f);
    // A "name" parameter (IPFS Pinning's ?name=) starts as the file's own name.
    if (f && fields.some((x) => x.key === "name")) setValues((v) => ({ ...v, name: f.name }));
  };
  const { address, chainId, isConnected } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Line[]>([]);
  const [result, setResult] = useState<{ body: string; receipt?: SettleResponse; receiptPage?: string; card: PaidResponse } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const push = (l: Line) => setLog((x) => [...x, l]);
  const show = (card: PaidResponse, receipt?: SettleResponse) => {
    const text = new TextDecoder().decode(card.bytes);
    setResult({ body: pretty(text), receipt, receiptPage: card.receiptPage, card });
    if (popup) setCardOpen(true);
    return text;
  };

  async function run() {
    if (nameEntry && !name.trim()) { setLog([{ t: "Type the name you want first.", tone: "bad" }]); return; }
    // A ticker typed into a token-address field ("TSLA") becomes that Stock Token's address.
    let vals = values;
    for (const f of fields) {
      const t = tokenMode(f, stockTokens) === "address" && !/^0x/i.test((vals[f.key] ?? "").trim()) ? bySymbol(stockTokens!, vals[f.key] ?? "") : undefined;
      if (t) vals = { ...vals, [f.key]: t.a };
    }
    if (vals !== values) setValues(vals);
    // Check the inputs before anything is fetched or signed.
    const bad = fields.find((f) => validateField(f, vals[f.key] ?? ""));
    if (bad) {
      setTouched(Object.fromEntries(fields.map((f) => [f.key, true])));
      setLog([{ t: `${bad.label}: ${validateField(bad, vals[bad.key] ?? "")}`, tone: "bad" }]);
      return;
    }
    const bodyErr = fileMode ? fileError(file) : hasBody ? jsonBodyError(jsonBody) : null;
    if (bodyErr) { setLog([{ t: bodyErr, tone: "bad" }]); return; }
    const base = native ? `/api/try-native/${native.serviceId}` : `/g/${slug}`;
    const url = nameEntry
      ? `${base}${pathAndQuery}/${encodeURIComponent(name.trim().toLowerCase())}`
      : fields.length ? buildTryUrl(slug, pathAndQuery, fields, vals, base) : `${base}${pathAndQuery}`;
    // A file goes as is, with its own type; otherwise the visitor's JSON (the seller's example to start).
    const init: RequestInit = method !== "POST"
      ? { method }
      : fileMode && file
        ? { method, headers: { "content-type": file.type || "application/octet-stream" }, body: file }
        : { method, headers: { "content-type": "application/json" }, body: nameEntry ? "{}" : jsonBody.trim() || "{}" };
    if (pricing === "free") {
      setBusy(true); setLog([{ t: `${method} ${url}` }]); setResult(null);
      try {
        const r = await fetch(url, init);
        push({ t: `${r.status} ${r.ok ? "OK · example request, free" : ""}`, tone: r.ok ? "ok" : "bad" });
        const bytes = new Uint8Array(await r.arrayBuffer());
        show({ bytes, contentType: r.headers.get("content-type") ?? "", status: r.status, paidLabel: r.ok ? "Example request · free" : `Error ${r.status}`, request: `${method} ${url}` });
      } catch (e) {
        push({ t: (e as Error).message, tone: "bad" });
      } finally { setBusy(false); }
      return;
    }
    if (!isConnected || !address) return open();
    setBusy(true); setLog([]); setResult(null);
    try {
      push({ t: `${method} ${url}` });
      const first = await fetch(url, init);
      if (first.status !== 402) {
        let msg = "";
        try { msg = ((await first.json()) as { error?: string }).error ?? ""; } catch {}
        push({ t: `${first.status}${msg ? `: ${msg}` : ""}`, tone: "bad" });
        return;
      }
      // x402 v2 carries the terms in PAYMENT-REQUIRED; some sellers leave the body's accepts empty.
      const prHeader = first.headers.get("PAYMENT-REQUIRED");
      const pr = (prHeader ? decodeHeader<PaymentRequired>(prHeader) : await first.json()) as PaymentRequired;
      // Only ever sign USDG on Robinhood Chain: the signature below is for that token's domain.
      const req = pr.accepts?.find((a) => a.network === NETWORK && getAddress(a.asset) === getAddress(USDG.address));
      if (!req) { push({ t: "This endpoint doesn't take USDG on Robinhood Chain, so Try it can't pay it.", tone: "bad" }); return; }
      if (native && getAddress(req.payTo) !== getAddress(native.payTo)) {
        push({ t: `Not signed: the seller's 402 now pays ${req.payTo}, not ${native.payTo}, the wallet this listing was published with.`, tone: "bad" });
        return;
      }
      const price = formatUsd(req.amount);
      push({ t: nameEntry ? `${name.trim().toLowerCase()}${nameEntry.suffix ?? ""} is available · ${price} USDG` : `402 Payment Required · ${price} USDG to ${req.payTo.slice(0, 8)}…`, tone: "dim" });
      if (chainId !== ROBINHOOD_CHAIN_ID) { push({ t: "Switching wallet to Robinhood Chain…", tone: "dim" }); await switchChainAsync({ chainId: ROBINHOOD_CHAIN_ID }); }
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      // 10 minutes, or less when a native seller's own 402 asks for a shorter window.
      const ttl = native && req.maxTimeoutSeconds > 0 ? Math.min(600, req.maxTimeoutSeconds) : 600;
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + ttl);
      const message = { from: getAddress(address), to: getAddress(req.payTo), value: BigInt(req.amount), validAfter: 0n, validBefore, nonce };
      push({ t: "Asking your wallet to sign (no gas)…", tone: "dim" });
      const signature = await signTypedDataAsync({ domain: usdgDomain, types: transferWithAuthorizationTypes, primaryType: "TransferWithAuthorization", message });
      const payment: PaymentPayload = {
        x402Version: 2,
        resource: pr.resource,
        accepted: req,
        payload: { signature, authorization: { ...message, value: message.value.toString(), validAfter: "0", validBefore: validBefore.toString() } },
      };
      push({ t: "Retrying with PAYMENT-SIGNATURE…", tone: "dim" });
      const paid = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), "PAYMENT-SIGNATURE": encodeHeader(payment) } });
      const bytes = new Uint8Array(await paid.arrayBuffer());
      const body = new TextDecoder().decode(bytes);
      if (!paid.ok) {
        let msg = body;
        try { const j = JSON.parse(body); msg = j.error ? `${j.error}${j.reason ? ` (${j.reason})` : ""}` : j.error ?? body; } catch {}
        if (paid.status === 402) { try { msg = (JSON.parse(body) as PaymentRequired).error ?? msg; } catch {} }
        push({ t: `${paid.status}: ${humanize(msg)}`, tone: "bad" });
        return;
      }
      const rh = paid.headers.get("PAYMENT-RESPONSE");
      const receipt = rh ? decodeHeader<SettleResponse>(rh) : undefined;
      push({ t: `200 OK · paid ${price} USDG`, tone: "ok" });
      show({
        bytes,
        contentType: paid.headers.get("content-type") ?? "",
        status: paid.status,
        paidLabel: `Paid ${price} USDG`,
        request: `${method} ${url}`,
        transaction: receipt?.transaction || undefined,
        receiptPage: paid.headers.get("x-x402fi-receipt") ?? undefined,
        receiptSha256: paid.headers.get("x-x402fi-response-sha256") ?? undefined,
      }, receipt);
      if (onPaid) { try { onPaid(JSON.parse(body)); } catch { /* non-JSON response */ } }
    } catch (e) {
      push({ t: (e as Error).message.split("\n")[0], tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {nameEntry && !nameEntry.locked && (
        <div className="mb-3 flex items-center gap-2">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="yourname" spellCheck={false} autoCapitalize="none" aria-label="Name to register" />
          {nameEntry.suffix && <span className="shrink-0 font-mono text-sm text-ink-3">{nameEntry.suffix}</span>}
        </div>
      )}
      {!nameEntry && fields.length > 0 && (
        <div className="mb-3 space-y-3">
          {fields.map((f) => {
            const id = `try-${slug}-${pathAndQuery}-${f.key}`;
            const tm = tokenMode(f, stockTokens);
            // A known ticker left in a token-address field is resolved on Try it, so it is not an error.
            const resolvable = tm === "address" && !!bySymbol(stockTokens!, values[f.key] ?? "");
            const err = touched[f.key] && !resolvable ? validateField(f, values[f.key] ?? "") : null;
            const mine = f.kind === "wallet" && address && values[f.key]?.toLowerCase() === address.toLowerCase();
            return (
              <div key={f.key}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor={id} className="text-xs text-ink-2">
                    {f.label} <span className="font-mono text-ink-3">{f.key}</span>
                  </label>
                  {f.kind === "wallet" && address && !mine && (
                    <button type="button" onClick={() => { setValues((v) => ({ ...v, [f.key]: address })); setTouched((t) => ({ ...t, [f.key]: true })); }}
                      className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2 hover:border-ink-3 hover:text-ink">
                      Use my wallet
                    </button>
                  )}
                  {f.kind === "wallet" && mine && <span className="text-xs text-ink-3">Your wallet</span>}
                </div>
                {tm ? (
                  <TokenField
                    mode={tm}
                    list={stockTokens!}
                    id={id}
                    value={values[f.key] ?? ""}
                    onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))}
                    onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                    invalid={!!err}
                    describedBy={err ? `${id}-err` : undefined}
                    placeholder={tm === "ticker" ? "Ticker or company, e.g. TSLA" : "0x… or search a Stock Token, e.g. TSLA"}
                  />
                ) : (
                <input
                  id={id}
                  className="field"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                  placeholder={f.example}
                  inputMode={f.kind === "number" ? "decimal" : undefined}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  aria-invalid={!!err}
                  aria-describedby={err ? `${id}-err` : undefined}
                />
                )}
                {err &&<p id={`${id}-err`} className="mt-1 text-xs text-bad">{err}</p>}
              </div>
            );
          })}
        </div>
      )}
      {fileMode && (
        <div className="mb-3">
          <span className="mb-1 block text-xs text-ink-2">File <span className="text-ink-3">· up to 1 MB</span></span>
          <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-3.5 py-3 text-sm hover:border-ink-3 ${file && fileError(file) ? "border-bad" : "border-line"}`}>
            <span className="min-w-0 truncate">{file ? <><span className="font-mono">{file.name}</span> <span className="text-ink-3">· {formatBytes(file.size)}</span></> : <span className="text-ink-3">Choose a file…</span>}</span>
            <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">{file ? "Change" : "Browse"}</span>
            <input type="file" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} aria-label="File to send" />
          </label>
          {file && fileError(file) && <p className="mt-1 text-xs text-bad">{fileError(file)}</p>}
        </div>
      )}
      {hasBody && !fileMode && (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-2">JSON body</span>
          <textarea className="field min-h-24 text-sm" value={jsonBody} onChange={(e) => setJsonBody(e.target.value)} spellCheck={false} autoCapitalize="none" aria-invalid={!!jsonBodyError(jsonBody)} />
          {jsonBodyError(jsonBody) && <p className="mt-1 text-xs text-bad">{jsonBodyError(jsonBody)}</p>}
        </label>
      )}
      <button onClick={run} disabled={busy} className={`btn w-full ${pricing === "free" ? "btn-ghost" : "btn-primary"}`}>
        {busy ? "Working…" : pricing === "free" ? "Try the example · free" : !isConnected ? (nameEntry?.cta ? "Connect wallet to register" : "Connect a wallet to try it") : nameEntry ? nameEntry.cta ?? "Check price, then register" : `Try it · ${pricing === "quote" ? "see price, then pay" : `pay ${priceLabel}`}`}
      </button>
      {pricing === "free" && !nameEntry && <p className="mt-2 text-center text-xs text-ink-3">{fields.length ? "Runs with the values above. They start as the seller's example." : "Runs the seller's example request shown above."}</p>}
      {pricing !== "free" && <p className="mt-2 text-center text-xs text-ink-3">Needs USDG on Robinhood Chain. No gas: x402Fi pays it.</p>}
      {log.length > 0 && (
        <ol className="mt-4 space-y-1 rounded-lg bg-forest p-3 font-mono text-[0.75rem] text-forest-ink">
          {log.map((l, i) => (
            <li key={i} className={l.tone === "bad" ? "text-[#f0a49b]" : l.tone === "ok" ? "text-[#a9dcb3]" : l.tone === "dim" ? "opacity-70" : ""}>{l.t}</li>
          ))}
        </ol>
      )}
      {result && (
        <div className="mt-4 space-y-3">
          {popup ? (
            <button onClick={() => setCardOpen(true)} className="btn btn-ghost w-full text-sm">View response</button>
          ) : (
            <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[0.75rem]">{result.body}</pre>
          )}
          {result.receipt?.transaction && (
            <div className="flex flex-wrap gap-3 text-sm">
              <a href={txUrl(result.receipt.transaction)} target="_blank" rel="noreferrer" className="underline">View transaction</a>
              {result.receiptPage && <a href={result.receiptPage} target="_blank" rel="noreferrer" className="underline">Receipt</a>}
            </div>
          )}
        </div>
      )}
      {popup && result && (
        <ResponseCard open={cardOpen} onClose={() => setCardOpen(false)} response={result.card} fileBase={`${slug}-${result.receiptPage?.split("/").pop() ?? Date.now()}`} />
      )}
    </div>
  );
}

function pretty(s: string) {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s.slice(0, 4000); }
}

const HUMAN: Record<string, string> = {
  insufficient_funds_in_flight: "Your other calls in flight already use your USDG balance. Wait for them to finish, then try again.",
  insufficient_funds: "Your wallet does not have enough USDG on Robinhood Chain.",
  authorization_expired: "The signature expired before it arrived. Try again.",
  invalid_signature: "The signature did not match. If you use a smart-contract wallet, it may not support this yet.",
};
function humanize(m: string) {
  for (const k of Object.keys(HUMAN)) if (m.includes(k)) return HUMAN[k];
  return m;
}
