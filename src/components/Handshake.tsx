"use client";
import { useEffect, useState } from "react";

export const STEPS = [
  {
    key: "ask",
    who: "agent",
    title: "The agent asks",
    plain: "An AI agent calls your API, just like any app would.",
    wire: "GET /g/fx-rates?pair=EURUSD",
    detail: "No account, no API key, no sign-up. The request is an ordinary HTTPS call.",
  },
  {
    key: "quote",
    who: "server",
    title: "x402Fi quotes a price",
    plain: "Instead of the data, it answers 402 Payment Required with a price tag.",
    wire: '402 · amount: "10000" (0.01 USDG) · payTo: 0x8f3…c21 · network: eip155:4663',
    detail: "HTTP 402 has been reserved for payments since 1997; x402 finally defines it. The quote names the price, the token (USDG), the chain (Robinhood Chain) and who gets paid. If the seller has an x402 Identity, it also names them, e.g. acme.402api.eth.",
  },
  {
    key: "sign",
    who: "agent",
    title: "The agent signs",
    plain: "The agent's wallet signs a one-time permission to move exactly that amount.",
    wire: "PAYMENT-SIGNATURE: { from, to, value, validBefore, nonce, signature }",
    detail: "It is a signature, not a transaction: the agent pays no gas and can't be charged more, twice, or after it expires. Before signing, a careful agent checks the Verified Payee record to confirm who it is paying.",
  },
  {
    key: "deliver",
    who: "server",
    title: "Your API answers",
    plain: "x402Fi checks the signature, forwards the call to your API and gets the answer.",
    wire: "→ your-api.com/fx-rates   200 OK",
    detail: "If your API fails, the payment is never taken. The buyer only pays for answers that arrive.",
  },
  {
    key: "settle",
    who: "chain",
    title: "Money moves, onchain",
    plain: "USDG goes straight from the agent's wallet to yours, with a receipt.",
    wire: "transferWithAuthorization → tx 0x4be…9a2 ✓   PAYMENT-RESPONSE",
    detail: "x402Fi pays the gas and never holds the funds. Every payment gets a public transaction hash and a receipt in your dashboard and CSV export.",
  },
] as const;

const WHO: Record<string, string> = { agent: "AI agent", server: "x402Fi gateway", chain: "Robinhood Chain" };

export function Handshake({ detailed = false, auto = true }: { detailed?: boolean; auto?: boolean }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(!auto);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 3200);
    return () => clearInterval(t);
  }, [paused]);
  const s = STEPS[i];
  return (
    <div className="card overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => auto && setPaused(false)}>
      <div className="grid grid-cols-5 border-b border-line">
        {STEPS.map((st, n) => (
          <button
            key={st.key}
            onClick={() => { setI(n); setPaused(true); }}
            className={`relative px-1 py-3 text-left transition-colors sm:px-4 ${n === i ? "bg-card" : "hover:bg-card/60"}`}
            aria-current={n === i}
          >
            <div className="eyebrow !text-[0.62rem] sm:!text-[0.7rem]">{String(n + 1).padStart(2, "0")}</div>
            <div className={`mt-1 hidden text-sm sm:block ${n === i ? "text-ink" : "text-ink-3"}`}>{st.title}</div>
            <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: n <= i ? "var(--ink)" : "transparent" }} />
          </button>
        ))}
      </div>
      <div key={s.key} className="rise grid gap-6 p-5 sm:p-8 md:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="eyebrow">{WHO[s.who]}</div>
          <h3 className="display mt-2 text-3xl sm:text-4xl">{s.title}</h3>
          <p className="mt-3 text-ink-2">{s.plain}</p>
          {detailed && <p className="mt-3 text-sm leading-relaxed text-ink-3">{s.detail}</p>}
        </div>
        <div className="self-center">
          <Lanes active={s.who} />
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-forest p-4 font-mono text-[0.78rem] leading-relaxed text-forest-ink">{s.wire}</pre>
        </div>
      </div>
    </div>
  );
}

function Lanes({ active }: { active: string }) {
  const nodes = ["agent", "server", "chain"];
  return (
    <div className="flex items-center justify-between gap-2">
      {nodes.map((n, k) => (
        <div key={n} className="flex flex-1 items-center gap-2">
          <div className={`flex-1 rounded-md border px-2 py-2 text-center text-xs transition-colors sm:text-sm ${active === n ? "border-ink bg-ink text-bg" : "border-line text-ink-3"}`}>{WHO[n]}</div>
          {k < nodes.length - 1 && <div className="h-px w-3 bg-line sm:w-6" />}
        </div>
      ))}
    </div>
  );
}
