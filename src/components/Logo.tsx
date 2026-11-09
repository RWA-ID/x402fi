export function LogoMark({ className = "h-7 w-7", bg = "var(--chip-bg)", ink = "var(--chip-ink)" }: { className?: string; bg?: string; ink?: string }) {
  // Original mark: a payment "gate" — two posts and a lintel with a coin slot.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill={bg} />
      <path d="M8 24V11.5a3.5 3.5 0 0 1 3.5-3.5h9A3.5 3.5 0 0 1 24 11.5V24" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <rect x="13" y="13" width="6" height="2.6" rx="1.3" fill={ink} />
      <circle cx="16" cy="20.5" r="2.3" fill={ink} />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="display text-[1.7rem] leading-none tracking-tight">
        x402<span className="italic">Fi</span>
      </span>
    </span>
  );
}
