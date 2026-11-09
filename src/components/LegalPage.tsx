import Link from "next/link";

export const LEGAL = {
  entity: "Only Buy Bitcoin LLC",
  site: "x402Fi",
  domain: "x402fi.dev",
  email: "contact@x402fi.dev",
  effective: "November 8, 2026",
} as const;

const PAGES = [
  ["/terms", "Terms of Service"],
  ["/privacy", "Privacy Policy"],
  ["/disclaimer", "Disclaimer"],
] as const;

export function LegalPage({ title, current, children }: { title: string; current: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
      <p className="eyebrow">Legal</p>
      <h1 className="display mt-3 text-5xl sm:text-6xl">{title}</h1>
      <p className="mt-4 text-sm text-ink-3">
        Effective {LEGAL.effective}. Operated by {LEGAL.entity}. Questions:{" "}
        <a className="underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Legal pages">
        {PAGES.map(([href, label]) => (
          <Link key={href} href={href} aria-current={href === current ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${href === current ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-ink-3"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <article className="legal mt-10 space-y-5 leading-relaxed text-ink-2">{children}</article>
    </div>
  );
}

export function H({ children }: { children: React.ReactNode }) {
  return <h2 className="display pt-6 text-3xl text-ink">{children}</h2>;
}
