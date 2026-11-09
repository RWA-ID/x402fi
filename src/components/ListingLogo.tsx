"use client";
import { useState } from "react";

/**
 * A listing's logo via /api/logo/<slug> (fetched and checked server-side).
 * Falls back to the listing's initial when there is no logo or it fails.
 */
export function ListingLogo({ slug, name, size = 48, className = "" }: { slug: string; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (failed) {
    return (
      <span style={box} className={`grid shrink-0 place-items-center rounded-xl bg-card font-serif text-ink-2 ${className}`} aria-hidden>
        <span style={{ fontSize: size * 0.5 }}>{name.trim().charAt(0).toUpperCase()}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/logo/${slug}`} alt="" style={box} className={`shrink-0 rounded-xl border border-line bg-card object-cover ${className}`} onError={() => setFailed(true)} loading="lazy" />
  );
}
