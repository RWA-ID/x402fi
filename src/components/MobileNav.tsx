"use client";
import Link from "next/link";
import { useState } from "react";

const items = [
  { href: "/market", label: "Marketplace" },
  { href: "/learn", label: "How x402 works" },
  { href: "/institutions", label: "Institutions" },
  { href: "/developers", label: "Developers" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sell/new", label: "List a service" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-card">
        <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b border-line bg-bg px-4 pb-4">
          {items.map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="block border-b border-line py-3 text-lg">{i.label}</Link>
          ))}
        </div>
      )}
    </>
  );
}
