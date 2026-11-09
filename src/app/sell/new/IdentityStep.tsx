"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import { namehash, type Hex } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { X402Widget } from "@x402identity/widget-react";
import { useWritePayee } from "@/lib/client/useWritePayee";
import { hoodfiName, useWriteHoodfiPayee } from "@/lib/client/useWriteHoodfiPayee";
import { TryIt } from "@/app/market/[slug]/TryIt";
import { parseLogo, parseWebsite, parseXHandle } from "@/lib/profile";
import type { Draft } from "./Wizard";
import { Field } from "./Wizard";

/** x402 Identity Hub contracts on Ethereum mainnet (see RWA-ID/x402-Identity). */
const REGISTRAR = "0xeb9e9ea385fe28b51a3f9a7d93fb893e0a1f9633" as const;
const FORWARDER = "0x05af104ce913e7ef39799bfada871817d3761778" as const;
/** x402Fi charges no platform fee, so nothing is ever sent here. */
const NO_FEE_TREASURY = "0x000000000000000000000000000000000000dEaD" as const;
const PARENTS = [
  { label: "402api.eth", description: "Services & APIs" },
  { label: "402bot.eth", description: "Agents" },
  { label: "402mcp.eth", description: "MCP servers" },
].map((p) => ({ ...p, node: namehash(p.label) as Hex }));

type Mode = "skip" | "new" | "existing" | "hoodfi";

export function IdentityStep({ d, set }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  const [mode, setMode] = useState<Mode>(d.identityName ? (d.identityName.endsWith(".hoodfi.eth") ? "hoodfi" : "existing") : "skip");
  const [hoodfiInput, setHoodfiInput] = useState(d.identityName.endsWith(".hoodfi.eth") ? d.identityName.replace(/\.hoodfi\.eth$/, "") : "");
  const hoodfiPayee = useWriteHoodfiPayee();
  const [existing, setExisting] = useState(d.identityName);
  const { address, chainId, isConnected } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: walletClient } = useWalletClient({ chainId: mainnet.id });
  const payee = useWritePayee();
  // The origin buyers contact: x402Fi's gateway, or for a native endpoint the seller's own host.
  const origin = (() => {
    if (d.native) { try { return new URL(d.upstreamUrl).origin; } catch { return ""; } }
    return typeof window !== "undefined" ? window.location.origin : "";
  })();

  const linkName = (n: string) => set("identityName", n.trim().toLowerCase());

  // Optional public profile, written to the name in the same transaction.
  const [prof, setProf] = useState({ avatar: "", url: "", x: "" });
  const check = <T,>(f: () => T): { ok: true; v: T } | { ok: false; msg: string } => {
    try { return { ok: true, v: f() }; } catch (e) { return { ok: false, msg: (e as Error).message }; }
  };
  const avatarCheck = check(() => parseLogo(prof.avatar));
  const urlCheck = check(() => parseWebsite(prof.url));
  const xCheck = check(() => parseXHandle(prof.x));
  const profileOk = avatarCheck.ok && urlCheck.ok && xCheck.ok;
  const profileRecords = {
    avatar: prof.avatar.trim() || undefined, // stored as typed: ipfs:// stays ipfs://
    url: urlCheck.ok ? urlCheck.v ?? undefined : undefined,
    twitter: xCheck.ok ? xCheck.v ?? undefined : undefined,
  };
  // ENS names are written on Ethereum; HoodFi names on Robinhood Chain (L2Registry).
  const writer = mode === "hoodfi" ? hoodfiPayee : payee;
  const target = mode === "hoodfi" ? hoodfiName(hoodfiInput) : existing.trim().toLowerCase() || null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-xl">Name who gets paid <span className="text-ink-3">(optional)</span></h2>
        <p className="mt-2 text-ink-2">
          Without a name, buyers see only a wallet address. With an x402 Identity name such as <span className="font-mono">yourco.402api.eth</span>,
          they can check onchain that this service and this payout wallet really belong to you. Listings with a named payee get a
          <strong> Verified payee</strong> badge.
        </p>
        <p className="mt-2 text-sm text-ink-3">This is the only paid step on x402Fi: the name&apos;s mint fee plus Ethereum gas, paid in ETH. x402Fi adds nothing on top.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["skip", "Skip for now", "Add a name later from the dashboard."],
          ["new", "Register a name", "Mint yourco.402api.eth in one transaction."],
          ["existing", "I have a name", "Link any ENS name you control."],
          ["hoodfi", "Use a HoodFi name", "yourco.hoodfi.eth: native to Robinhood Chain, records written there."],
        ] as const).map(([m, t, s]) => (
          <button key={m} type="button" onClick={() => { setMode(m); if (m === "skip") set("identityName", ""); }}
            className={`rounded-xl border p-4 text-left transition-colors ${mode === m ? "border-ink bg-card" : "border-line hover:border-ink-3"}`}>
            <div className="font-medium">{t}</div>
            <div className="mt-1 text-sm text-ink-3">{s}</div>
          </button>
        ))}
      </div>

      {mode === "new" && (
        <div className="space-y-4">
          {!isConnected ? (
            <button onClick={() => open()} className="btn btn-primary">Connect wallet</button>
          ) : chainId !== mainnet.id ? (
            <div className="card p-5 text-sm">
              <p>Names are minted on Ethereum mainnet. Your wallet is on another network.</p>
              <button onClick={() => switchChainAsync({ chainId: mainnet.id })} className="btn btn-primary mt-3">Switch to Ethereum</button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <X402Widget
                registrar={REGISTRAR}
                forwarder={FORWARDER}
                parents={PARENTS}
                platformTreasury={NO_FEE_TREASURY}
                platformFeeWei={0n}
                chain={mainnet}
                rpcUrl={`${origin}/api/rpc/mainnet`}
                publicClient={publicClient as never}
                walletClient={walletClient as never}
                account={address}
                onConnect={() => open()}
                theme="light"
                blockExplorerUrl="https://etherscan.io"
                onSuccess={(label, parentNode) => {
                  const parent = PARENTS.find((p) => p.node === parentNode)?.label ?? "402api.eth";
                  const full = `${label}.${parent}`;
                  linkName(full);
                  setExisting(full);
                  setMode("existing");
                }}
              />
            </div>
          )}
        </div>
      )}

      {mode === "hoodfi" && (
        <div className="space-y-4">
          <Field label="HoodFi name" hint="The wallet you connect must own this name.">
            <div className="flex items-center gap-2">
              <input className="field" value={hoodfiInput} onChange={(e) => { setHoodfiInput(e.target.value); const n = hoodfiName(e.target.value); set("identityName", n ?? ""); }} placeholder="yourco" spellCheck={false} autoCapitalize="none" />
              <span className="shrink-0 font-mono text-sm text-ink-3">.hoodfi.eth</span>
            </div>
          </Field>
          <details className="card p-5 text-sm">
            <summary className="cursor-pointer font-medium">Don&apos;t have one? Register it here, from $3 in USDG</summary>
            <p className="mt-2 text-ink-3">Paid over x402 with one signature (no gas) through x402Fi&apos;s HoodFi listing. The name goes to the wallet that signs.</p>
            <div className="mt-4">
              <TryIt slug="hoodfi-names" method="POST" pathAndQuery="/register" pricing="contract" priceLabel="Up to $15.00" nameEntry={{ suffix: ".hoodfi.eth" }}
                onPaid={(body) => {
                  const n = (body as { name?: unknown })?.name;
                  if (typeof n === "string" && n.endsWith(".hoodfi.eth")) { setHoodfiInput(n.replace(/\.hoodfi\.eth$/, "")); set("identityName", n); }
                }} />
            </div>
          </details>
          <p className="rounded-lg bg-card p-3 text-xs text-ink-2">
            Only the wallet that owns a HoodFi name can change its records. The parent name, hoodfi.eth, and the resolver that
            serves HoodFi names on Ethereum are administered by HoodFi&apos;s 2-of-3 Safe, as with any name under a parent, so the
            payee check reports the parent as able to control it.
          </p>
        </div>
      )}

      {(mode === "existing" || mode === "hoodfi") && (
        <div className="space-y-4">
          {mode === "existing" && (
          <Field label="ENS name" hint="The wallet you connect must own or manage this name.">
            <input className="field" value={existing} onChange={(e) => { setExisting(e.target.value); linkName(e.target.value); }} placeholder="yourco.402api.eth" spellCheck={false} />
          </Field>
          )}
          <div className="card p-5">
            <div className="eyebrow">Records to write on {(mode === "hoodfi" ? hoodfiName(hoodfiInput) : existing) || "your name"}</div>
            <ul className="mt-3 space-y-1.5 font-mono text-[0.8rem] text-ink-2">
              <li>org.x402.origins ← adds {origin || "this site"}</li>
              <li>Robinhood Chain address (coin type 2147488311) ← {d.payTo || "your payout wallet"}</li>
              {profileRecords.avatar && <li>avatar ← {profileRecords.avatar}</li>}
              {profileRecords.url && <li>url ← {profileRecords.url}</li>}
              {profileRecords.twitter && <li>com.twitter ← {profileRecords.twitter}</li>}
            </ul>
            <p className="mt-3 text-sm text-ink-3">
              {mode === "hoodfi" ? "One Robinhood Chain transaction (gas in ETH on Robinhood Chain)." : "One Ethereum transaction."} Existing origins and payees on the name are kept.
            </p>

            <div className="mt-5 border-t border-line pt-4">
              <div className="eyebrow">Public profile (optional)</div>
              <p className="mt-1 text-sm text-ink-3">Shown on your listing with a verified mark, because only the name&apos;s owner can set these records. Leave blank to keep what the name already has.</p>
              <div className="mt-3 grid gap-3">
                {([
                  ["avatar", "Logo (https:// or ipfs:// PNG, JPEG, WebP or GIF)", "https://yourco.com/logo.png", avatarCheck],
                  ["url", "Website", "https://yourco.com", urlCheck],
                  ["x", "X profile", "@yourco", xCheck],
                ] as const).map(([k, label, ph, c]) => (
                  <label key={k} className="block">
                    <span className="text-sm text-ink-2">{label}</span>
                    <input className="field mt-1" value={prof[k]} placeholder={ph} spellCheck={false} autoCapitalize="none" onChange={(e) => setProf((p) => ({ ...p, [k]: e.target.value }))} />
                    {!c.ok && <span className="mt-1 block text-xs text-bad">{c.msg}</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="btn btn-primary"
                disabled={!target || !d.payTo || !profileOk || ["reading", "signing", "confirming"].includes(writer.state)}
                onClick={() => (isConnected ? writer.write(target!, origin, d.payTo, profileRecords) : open())}
              >
                {writer.state === "reading" ? "Reading records…" : writer.state === "signing" ? "Confirm in wallet…" : writer.state === "confirming" ? (mode === "hoodfi" ? "Waiting for Robinhood Chain…" : "Waiting for Ethereum…") : writer.state === "written" ? "Written ✓" : "Write records"}
              </button>
              {writer.hash && <a className="text-sm underline" href={mode === "hoodfi" ? `https://robinhoodchain.blockscout.com/tx/${writer.hash}` : `https://etherscan.io/tx/${writer.hash}`} target="_blank" rel="noreferrer">Transaction</a>}
            </div>
            {writer.error && <p className="mt-3 text-sm text-bad">{writer.error}</p>}
            <p className="mt-3 text-xs text-ink-3">You can continue now and write the records later from the dashboard; the badge appears once they are on chain.</p>
          </div>
        </div>
      )}
    </div>
  );
}
