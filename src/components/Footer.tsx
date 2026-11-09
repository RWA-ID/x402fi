import Link from "next/link";
import { LogoMark } from "./Logo";

const cols = [
  { title: "Product", links: [["Marketplace", "/market"], ["List a service", "/sell/new"], ["Dashboard", "/dashboard"]] },
  { title: "Learn", links: [["How x402 works", "/learn"], ["For institutions", "/institutions"], ["Developers", "/developers"]] },
  { title: "Open data", links: [["Discovery feed", "/discovery"], ["Facilitator", "/developers#facilitator"], ["x402 Identity", "https://x402id.dev"]] },
  { title: "Legal", links: [["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Disclaimer", "/disclaimer"], ["contact@x402fi.dev", "mailto:contact@x402fi.dev"]] },
];

export function Footer() {
  return (
    <footer className="mt-24 px-2 pb-2 sm:px-3 sm:pb-3">
      <div className="ticks mb-3" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl bg-forest px-6 pb-6 pt-12 text-forest-ink sm:px-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div className="max-w-md">
            <LogoMark className="h-12 w-12" bg="var(--sand)" ink="var(--sand-ink)" />
            <p className="mt-6 text-sm leading-relaxed opacity-75">
              x402Fi lets businesses charge AI agents per request in USDG on Robinhood Chain, using the open x402 payment
              standard. Payments go straight from buyer to seller; x402Fi never holds funds. Listing is free.
            </p>
            <p className="mt-4 text-sm opacity-60">USDG is issued by Paxos. x402Fi is not a bank or money transmitter and does not custody assets.</p>
            <a
              href="https://x.com/x402fi_"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="x402Fi on X (@x402fi_)"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-sand/30 px-3 py-1.5 text-sm text-sand hover:bg-forest-2"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @x402fi_
            </a>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div className="font-medium">{c.title}</div>
              <ul className="mt-3 space-y-2 text-sm opacity-75">
                {c.links.map(([l, h]) => (
                  <li key={h}>
                    {h.startsWith("/") && !h.startsWith("/api") ? (
                      <Link href={h} className="hover:opacity-100 hover:underline">{l}</Link>
                    ) : (
                      <a href={h} className="hover:opacity-100 hover:underline">{l}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col-reverse items-start justify-between gap-6 sm:flex-row sm:items-end">
          <p className="text-sm opacity-60">© {new Date().getFullYear()} Only Buy Bitcoin LLC · x402Fi</p>
          <p className="display text-[clamp(3.5rem,11vw,8.5rem)] leading-[0.8] text-sand">
            Paid <span className="italic">per call.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
