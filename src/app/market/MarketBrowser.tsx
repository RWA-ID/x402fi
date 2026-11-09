"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListingCard } from "@/components/ListingCard";
import type { PublicListing } from "@/lib/server/queries";

export function MarketBrowser({ rows }: { rows: PublicListing[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<"popular" | "price" | "new">("popular");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const cats = useMemo(() => ["All", ...Array.from(new Set(rows.map((r) => r.category))).sort()], [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = rows.filter((r) =>
      (cat === "All" || r.category === cat) &&
      (!verifiedOnly || r.identityName) &&
      (!t || `${r.name} ${r.summary} ${r.description} ${r.identityName ?? ""}`.toLowerCase().includes(t)));
    // Free-only listings sort first; quote-only last.
    const key = (r: PublicListing) => (r.fromAtomic ? BigInt(r.fromAtomic) : r.hasQuote ? 10n ** 18n : 0n);
    if (sort === "price") out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    if (sort === "new") out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }, [rows, q, cat, verifiedOnly, sort]);

  return (
    <>
      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="field !font-sans pr-14" aria-label="Search services" />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[0.7rem] text-ink-3">⌘K</kbd>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field !w-auto !font-sans" aria-label="Sort">
          <option value="popular">Most used</option>
          <option value="price">Lowest price</option>
          <option value="new">Newest</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="h-4 w-4 accent-[var(--forest)]" />
          Named payees only
        </label>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${cat === c ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-ink-3"}`}>{c}</button>
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((l) => <ListingCard key={l.id} l={l} />)}
      </div>
      {!shown.length && <div className="card mt-6 p-10 text-center text-ink-2">No services match. Try another search.</div>}
    </>
  );
}
