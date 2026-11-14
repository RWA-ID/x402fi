import Link from "next/link";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { WalletButton } from "./WalletButton";

export const NAV = [
  { href: "/market", label: "Marketplace" },
  { href: "/learn", label: "How x402 works" },
  { href: "/institutions", label: "Institutions" },
  { href: "/developers", label: "Developers" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="x402Fi home"><Logo /></Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-[0.95rem] text-ink-2 hover:bg-card hover:text-ink">{n.label}</Link>
          ))}
          <Link href="/dashboard" className="rounded-md px-3 py-2 text-[0.95rem] text-ink-2 hover:bg-card hover:text-ink">Dashboard</Link>
          <Link href="/sell/new" className="btn btn-primary ml-2 py-2">List a service</Link>
          <span className="ml-2"><WalletButton /></span>
        </nav>
        <div className="flex items-center gap-1 lg:hidden">
          <WalletButton compact />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
