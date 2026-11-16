"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { byAddress, bySymbol, logoUrl, midPrice, QUICK_PICKS, searchTokens, type StockPrice, type StockToken } from "@/lib/stock-tokens";

/** The Stock Token list, fetched once per page and shared by every field. null until loaded (or on failure). */
let listPromise: Promise<StockToken[] | null> | null = null;
export function useStockTokens(enabled: boolean): StockToken[] | null {
  const [list, setList] = useState<StockToken[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    listPromise ??= fetch("/api/stock-tokens").then((r) => (r.ok ? (r.json() as Promise<StockToken[]>) : null)).catch(() => null);
    let live = true;
    listPromise.then((l) => { if (live) setList(l); });
    return () => { live = false; };
  }, [enabled]);
  return list;
}

/** Brandfetch logo by ticker; a ticker-letter badge if it does not load. */
export function TokenLogo({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (failed) {
    return (
      <span aria-hidden style={{ ...style, fontSize: size * 0.4 }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-forest font-mono font-medium text-forest-ink">
        {symbol.slice(0, 2)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked by design (Brandfetch serves browsers only)
  return <img src={logoUrl(symbol)} alt="" width={size} height={size} style={style} className="shrink-0 rounded-full bg-white object-contain" loading="lazy" onError={() => setFailed(true)} />;
}

/**
 * A Try it field backed by the Stock Token list.
 * - "ticker": quick-pick chips + search by ticker or name; the value is the ticker.
 * - "address": type a 0x address, or search by ticker or name to fill in the token's address.
 * Free text is always allowed: the list helps, it never limits what can be sent.
 */
export function TokenField({ mode, list, id, value, onChange, onBlur, invalid, describedBy, placeholder }: {
  mode: "ticker" | "address"; list: StockToken[]; id: string; value: string;
  onChange: (v: string) => void; onBlur: () => void; invalid?: boolean; describedBy?: string; placeholder: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = mode === "ticker" ? bySymbol(list, value) : byAddress(list, value);
  // An address being typed is not a search; neither is the exact ticker already chosen.
  const query = mode === "address" && /^0x/i.test(value.trim()) ? "" : value;
  const matches = useMemo(() => (selected && mode === "ticker" && selected.s === value.trim().toUpperCase() ? [] : searchTokens(list, query, 8)), [list, query, selected, mode, value]);
  const show = open && matches.length > 0;
  const picks = mode === "ticker" ? QUICK_PICKS.map((s) => bySymbol(list, s)).filter((t): t is StockToken => !!t) : [];

  const choose = (t: StockToken) => { onChange(mode === "ticker" ? t.s : t.a); setOpen(false); };

  return (
    <div>
      {picks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Popular tickers">
          {picks.map((t) => {
            const on = selected?.s === t.s;
            return (
              <button key={t.s} type="button" onClick={() => choose(t)} aria-pressed={on} title={t.n}
                className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 font-mono text-xs ${on ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-ink-3 hover:text-ink"}`}>
                <TokenLogo symbol={t.s} size={18} />
                {t.s}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative">
        {selected && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><TokenLogo symbol={selected.s} size={20} /></span>
        )}
        <input
          id={id}
          className="field"
          // Inline: .field's own padding (globals.css) beats a pl-* utility.
          style={selected ? { paddingLeft: "2.5rem" } : undefined}
          value={value}
          onChange={(e) => { onChange(mode === "ticker" ? e.target.value.toUpperCase() : e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => { setOpen(false); onBlur(); }, 120); }}
          onKeyDown={(e) => {
            if (!show) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
            else if (e.key === "Enter") { e.preventDefault(); choose(matches[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          role="combobox"
          aria-expanded={show}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={show ? `${listboxId}-${active}` : undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
        {show && (
          // In the flow, not floating: the endpoint card is overflow-hidden and would clip a popover.
          <ul id={listboxId} role="listbox" className="mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-elev p-1">
            {matches.map((t, i) => (
              <li key={t.s} id={`${listboxId}-${i}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); choose(t); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${i === active ? "bg-card" : ""}`}>
                <TokenLogo symbol={t.s} size={22} />
                <span className="w-14 shrink-0 font-mono font-medium">{t.s}</span>
                <span className="min-w-0 truncate text-ink-2">{t.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected && <PriceLine token={selected} showAddress={mode === "address"} />}
    </div>
  );
}

/** "Apple · AAPL · $354.90 · trading": Robinhood's live underlying price for the chosen token. */
function PriceLine({ token, showAddress }: { token: StockToken; showAddress: boolean }) {
  const [price, setPrice] = useState<StockPrice | null | "loading" | "none">("loading");
  useEffect(() => {
    let live = true;
    setPrice("loading");
    const t = setTimeout(() => {
      fetch(`/api/stock-tokens/price?symbol=${encodeURIComponent(token.s)}`)
        .then((r) => (r.ok ? (r.json() as Promise<StockPrice>) : null))
        .then((p) => { if (live) setPrice(p ?? "none"); })
        .catch(() => { if (live) setPrice("none"); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [token.s]);
  const mid = price && typeof price === "object" ? midPrice(price) : null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3" aria-live="polite">
      <span className="text-ink-2">{token.n}</span>
      <span>·</span>
      <span className="font-mono">{token.s}</span>
      {showAddress && <><span>·</span><span className="font-mono">{token.a.slice(0, 6)}…{token.a.slice(-4)}</span></>}
      {price === "loading" && <><span>·</span><span>price…</span></>}
      {mid && typeof price === "object" && price && (
        <>
          <span>·</span>
          <span className="font-mono text-ink-2" title={`Underlying share price from Robinhood, bid ${price.bid} / ask ${price.ask}. Not adjusted for the token's multiplier.`}>${mid}</span>
          <span>·</span>
          <span className={price.halted ? "text-bad" : "text-good"}>{price.halted ? "trading halted" : "trading"}</span>
        </>
      )}
    </p>
  );
}
