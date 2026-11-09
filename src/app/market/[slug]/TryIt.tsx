"use client";
import { useState } from "react";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { toHex, getAddress } from "viem";
import { ROBINHOOD_CHAIN_ID, txUrl } from "@/lib/chains";
import { decodeHeader, encodeHeader } from "@/lib/x402/encoding";
import { transferWithAuthorizationTypes, usdgDomain } from "@/lib/x402/eip712";
import type { PaymentPayload, PaymentRequired, SettleResponse } from "@/lib/x402/types";
import { formatUsd } from "@/lib/x402/money";

type Line = { t: string; tone?: "ok" | "bad" | "dim" };

/**
 * `nameEntry`: a contract endpoint that sells a name. The buyer types it, the URL becomes
 * `/g/<slug><path>/<name>`, and the exact price is shown before the wallet asks to sign.
 */
export function TryIt({ slug, method, pathAndQuery, pricing, priceLabel, nameEntry, onPaid }: {
  slug: string; method: string; pathAndQuery: string; pricing: "free" | "fixed" | "quote" | "contract"; priceLabel: string;
  nameEntry?: { suffix?: string };
  /** Called with the parsed JSON response after a successful paid call (e.g. a registered name). */
  onPaid?: (body: unknown) => void;
}) {
  const [name, setName] = useState("");
  const { address, chainId, isConnected } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Line[]>([]);
  const [result, setResult] = useState<{ body: string; receipt?: SettleResponse; receiptPage?: string } | null>(null);
  const push = (l: Line) => setLog((x) => [...x, l]);

  async function run() {
    if (nameEntry && !name.trim()) { setLog([{ t: "Type the name you want first.", tone: "bad" }]); return; }
    const url = nameEntry ? `/g/${slug}${pathAndQuery}/${encodeURIComponent(name.trim().toLowerCase())}` : `/g/${slug}${pathAndQuery}`;
    const init: RequestInit = method === "POST" ? { method, headers: { "content-type": "application/json" }, body: "{}" } : { method };
    if (pricing === "free") {
      setBusy(true); setLog([{ t: `${method} ${url}` }]); setResult(null);
      try {
        const r = await fetch(url, init);
        push({ t: `${r.status} ${r.ok ? "OK · free, no payment" : ""}`, tone: r.ok ? "ok" : "bad" });
        setResult({ body: pretty(await r.text()) });
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
      const pr = (await first.json()) as PaymentRequired;
      const req = pr.accepts[0];
      const price = formatUsd(req.amount);
      push({ t: nameEntry ? `${name.trim().toLowerCase()}${nameEntry.suffix ?? ""} is available · ${price} USDG` : `402 Payment Required · ${price} USDG to ${req.payTo.slice(0, 8)}…`, tone: "dim" });
      if (chainId !== ROBINHOOD_CHAIN_ID) { push({ t: "Switching wallet to Robinhood Chain…", tone: "dim" }); await switchChainAsync({ chainId: ROBINHOOD_CHAIN_ID }); }
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600);
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
      const body = await paid.text();
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
      setResult({ body: pretty(body), receipt, receiptPage: paid.headers.get("x-x402fi-receipt") ?? undefined });
      if (onPaid) { try { onPaid(JSON.parse(body)); } catch { /* non-JSON response */ } }
    } catch (e) {
      push({ t: (e as Error).message.split("\n")[0], tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {nameEntry && (
        <div className="mb-3 flex items-center gap-2">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="yourname" spellCheck={false} autoCapitalize="none" aria-label="Name to register" />
          {nameEntry.suffix && <span className="shrink-0 font-mono text-sm text-ink-3">{nameEntry.suffix}</span>}
        </div>
      )}
      <button onClick={run} disabled={busy} className={`btn w-full ${pricing === "free" ? "btn-ghost" : "btn-primary"}`}>
        {busy ? "Working…" : pricing === "free" ? "Try it · free" : !isConnected ? "Connect a wallet to try it" : nameEntry ? "Check price, then register" : `Try it · ${pricing === "quote" ? "see price, then pay" : `pay ${priceLabel}`}`}
      </button>
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
          <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[0.75rem]">{result.body}</pre>
          {result.receipt?.transaction && (
            <div className="flex flex-wrap gap-3 text-sm">
              <a href={txUrl(result.receipt.transaction)} target="_blank" rel="noreferrer" className="underline">View transaction</a>
              {result.receiptPage && <a href={result.receiptPage} className="underline">Receipt</a>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pretty(s: string) {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s.slice(0, 4000); }
}

const HUMAN: Record<string, string> = {
  insufficient_funds: "Your wallet does not have enough USDG on Robinhood Chain.",
  authorization_expired: "The signature expired before it arrived. Try again.",
  invalid_signature: "The signature did not match. If you use a smart-contract wallet, it may not support this yet.",
};
function humanize(m: string) {
  for (const k of Object.keys(HUMAN)) if (m.includes(k)) return HUMAN[k];
  return m;
}
