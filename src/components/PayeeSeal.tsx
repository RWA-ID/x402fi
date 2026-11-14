/** 12-point seal, viewBox 0 0 20 20. */
const SEAL = (() => {
  const n = 12, p: string[] = [];
  for (let k = 0; k < n * 2; k++) {
    const a = (Math.PI * k) / n - Math.PI / 2, r = k % 2 ? 8.1 : 9.5;
    p.push(`${(10 + r * Math.cos(a)).toFixed(2)},${(10 + r * Math.sin(a)).toFixed(2)}`);
  }
  return "M" + p.join("L") + "Z";
})();

export function PayeeSeal({ className = "h-[17px] w-[17px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`shrink-0 ${className}`} aria-hidden>
      <path d={SEAL} fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.3 10.3l2.5 2.4 4.9-5.1" fill="none" stroke="var(--accent-ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The seal pill. `verified` is only for a payee the onchain check confirmed;
 * listing cards have not run that check, so they pass verified={false} and say "Named payee".
 */
export function PayeePill({ verified, name }: { verified: boolean; name?: string }) {
  const label = verified ? "Verified payee" : "Named payee";
  const title = verified
    ? "Payee verified: this wallet is bound onchain to a signed x402 Identity name"
    : `Payee named ${name}. Open the listing for the live onchain check.`;
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full py-[3px] pl-1 pr-2.5 text-xs font-medium tracking-[.01em] text-verified-ink"
      style={{ background: "color-mix(in oklab, var(--accent) 13%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--accent) 28%, transparent)" }}
    >
      <PayeeSeal />
      {label}
    </span>
  );
}
