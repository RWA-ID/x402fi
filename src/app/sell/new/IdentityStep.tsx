"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import { namehash, type Hex } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { X402Widget } from "@x402identity/widget-react";
import { useWritePayee } from "@/lib/client/useWritePayee";
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

type Mode = "skip" | "new" | "existing";

export function IdentityStep({ d, set }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  const [mode, setMode] = useState<Mode>(d.identityName ? "existing" : "skip");
  const [existing, setExisting] = useState(d.identityName);
  const { address, chainId, isConnected } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: walletClient } = useWalletClient({ chainId: mainnet.id });
  const payee = useWritePayee();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

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

      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ["skip", "Skip for now", "Add a name later from the dashboard."],
          ["new", "Register a name", "Mint yourco.402api.eth in one transaction."],
          ["existing", "I have a name", "Link any ENS name you control."],
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

      {mode === "existing" && (
        <div className="space-y-4">
          <Field label="ENS name" hint="The wallet you connect must own or manage this name.">
            <input className="field" value={existing} onChange={(e) => { setExisting(e.target.value); linkName(e.target.value); }} placeholder="yourco.402api.eth" spellCheck={false} />
          </Field>
          <div className="card p-5">
            <div className="eyebrow">Records to write on {existing || "your name"}</div>
            <ul className="mt-3 space-y-1.5 font-mono text-[0.8rem] text-ink-2">
              <li>org.x402.origins ← adds {origin || "this site"}</li>
              <li>Robinhood Chain address (coin type 2147488311) ← {d.payTo || "your payout wallet"}</li>
              {profileRecords.avatar && <li>avatar ← {profileRecords.avatar}</li>}
              {profileRecords.url && <li>url ← {profileRecords.url}</li>}
              {profileRecords.twitter && <li>com.twitter ← {profileRecords.twitter}</li>}
            </ul>
            <p className="mt-3 text-sm text-ink-3">One Ethereum transaction. Existing origins and payees on the name are kept.</p>

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
                disabled={!existing || !d.payTo || !profileOk || ["reading", "signing", "confirming"].includes(payee.state)}
                onClick={() => (isConnected ? payee.write(existing.trim().toLowerCase(), origin, d.payTo, profileRecords) : open())}
              >
                {payee.state === "reading" ? "Reading records…" : payee.state === "signing" ? "Confirm in wallet…" : payee.state === "confirming" ? "Waiting for Ethereum…" : payee.state === "written" ? "Written ✓" : "Write records"}
              </button>
              {payee.hash && <a className="text-sm underline" href={`https://etherscan.io/tx/${payee.hash}`} target="_blank" rel="noreferrer">Transaction</a>}
            </div>
            {payee.error && <p className="mt-3 text-sm text-bad">{payee.error}</p>}
            <p className="mt-3 text-xs text-ink-3">You can continue now and write the records later from the dashboard; the badge appears once they are on chain.</p>
          </div>
        </div>
      )}
    </div>
  );
}
