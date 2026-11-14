"use client";
import { useEffect } from "react";

/**
 * Cursor spotlight for every `.spot` card on the page (see globals.css).
 * One delegated listener writes --mx/--my/--sa straight to the element's style,
 * so cards stay server components and nothing re-renders on pointer move.
 */
export function SpotlightCards() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    const off = () => { current?.style.setProperty("--sa", "0%"); current = null; };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(".spot") ?? null;
      if (el !== current) off();
      if (!el) return;
      current = el;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      el.style.setProperty("--sa", "10%");
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", off);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", off);
    };
  }, []);
  return null;
}
