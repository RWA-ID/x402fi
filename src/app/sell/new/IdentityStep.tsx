"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import { formatEther, getAddress, isAddress } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { registerVia } from "@x402identity/widget-core";
import { useWritePayee } from "@/lib/client/useWritePayee";
import { useWriteHoodfiPayee } from "@/lib/client/useWriteHoodfiPayee";
import { TryIt } from "@/app/market/[slug]/TryIt";
import { parseLogo, parseWebsite, parseXHandle } from "@/lib/profile";
import { formatUsd } from "@/lib/x402/money";
import { NO_FEE_TREASURY, X402ID_FORWARDER, X402ID_PARENTS, X402ID_REGISTRAR, toLabel, type NameSuggestion } from "@/lib/names";
import type { Draft } from "./Wizard";

type Brand = "hoodfi" | "x402";
/** What the seller picked: a new name to register, or one they already own. */
type Pick = { kind: "new"; brand: Brand; label: string; parent: string; price: string } | { kind: "own"; name: string };

type Check = { state: "verified" | "mismatch" | "unknown"; reasonText: string | null; owner: string | null };

export function BrandIcon({ brand, size = 28 }: { brand: Brand; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={brand === "hoodfi" ? "/brands/hoodfi.png" : "/brands/x402id.png"} alt={brand === "hoodfi" ? "HoodFi Names" : "x402 Identity"} width={size} height={size} className="shrink-0 rounded-[22%]" />;
}

const fullName = (p: Pick) => (p.kind === "own" ? p.name : p.brand === "hoodfi" ? `${p.label}.hoodfi.eth` : `${p.label}.${p.parent}`);

export function IdentityStep({ d, set }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  const [pick, setPick] = useState<Pick | null>(() => (d.identityName ? { kind: "own", name: d.identityName } : null));
  const [parent, setParent] = useState(X402ID_PARENTS[0]!.label);
  const [custom, setCustom] = useState("");
  const [ideas, setIdeas] = useState<NameSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [ownInput, setOwnInput] = useState(d.identityName);
  const origin = useMemo(() => {
    if (d.native) { try { return new URL(d.upstreamUrl).origin; } catch { return ""; } }
    return typeof window !== "undefined" ? window.location.origin : "";
  }, [d.native, d.upstreamUrl]);

  // Suggestions from the service name, or the seller's own search (debounced).
  const seq = useRef(0);
  useEffect(() => {
    const label = toLabel(custom);
    if (custom.trim() && !label) { setIdeas([]); return; }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ parent, ...(label ? { label } : { name: d.name }) });
      const r = await fetch(`/api/names/suggest?${qs}`, { signal: AbortSignal.timeout(20_000) }).then((r) => r.json() as Promise<{ suggestions: NameSuggestion[] }>).catch(() => ({ suggestions: [] }));
      if (n === seq.current) { setIdeas(r.suggestions); setLoading(false); }
    }, label ? 400 : 0);
    return () => clearTimeout(t);
  }, [custom, parent, d.name]);

  const choose = (p: Pick | null) => {
    setPick(p);
    set("identityName", p && p.kind === "own" ? p.name : "");
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-mono text-xl">Name your payout</h2>
        <p className="mt-2 text-ink-2">
          Buyers and their agents see who they are paying. Without a name that is a bare <span className="font-mono">0x…</span> address.
          With one, they can check onchain that this service and this wallet belong to you, and your listing gets the <strong>Verified payee</strong> badge.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <span className="text-ink-3">Buyers will see</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1 font-mono">
            {pick ? <BrandIcon brand={fullName(pick).endsWith(".hoodfi.eth") ? "hoodfi" : "x402"} size={18} /> : null}
            {pick ? fullName(pick) : (d.payTo ? `${d.payTo.slice(0, 6)}…${d.payTo.slice(-4)}` : "0x…")}
          </span>
          {pick && <span className="rounded-full bg-good/15 px-2.5 py-0.5 text-xs font-medium text-good">Verified payee, once set up</span>}
        </div>
      </div>

      {/* ---- Suggestions ---- */}
      {!pick || pick.kind === "new" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">{custom.trim() ? "Your search" : `Suggested for “${d.name || "your service"}”`}</div>
              <p className="mt-1 text-sm text-ink-3">Checked live on both registries. Pick one to register it here.</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-line p-1 text-xs" role="radiogroup" aria-label="x402 Identity namespace">
              {X402ID_PARENTS.map((p) => (
                <button key={p.label} type="button" role="radio" aria-checked={parent === p.label} onClick={() => setParent(p.label)}
                  className={`rounded-full px-2.5 py-1 font-mono ${parent === p.label ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`} title={p.description}>
                  .{p.label}
                </button>
              ))}
            </div>
          </div>
          <input className="field" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Search another name…" spellCheck={false} autoCapitalize="none" aria-label="Search a name" />

          <div className="space-y-3" aria-busy={loading}>
            {loading && !ideas && <SkeletonRows />}
            {ideas && ideas.length === 0 && <p className="text-sm text-ink-3">Use lowercase letters, numbers and hyphens (4+ characters).</p>}
            {ideas?.map((s) => (
              <div key={s.label} className="grid gap-2 sm:grid-cols-2">
                <NameTile brand="hoodfi" name={`${s.label}.hoodfi.eth`} status={s.hoodfi.available} reason={"reason" in s.hoodfi ? s.hoodfi.reason : ""}
                  price={s.hoodfi.available === true ? `${formatUsd(s.hoodfi.priceAtomic)} USDG` : ""} sub="Robinhood Chain · one signature, no gas"
                  selected={pick?.kind === "new" && pick.brand === "hoodfi" && pick.label === s.label}
                  onSelect={() => s.hoodfi.available === true && choose({ kind: "new", brand: "hoodfi", label: s.label, parent: "hoodfi.eth", price: `${formatUsd(s.hoodfi.priceAtomic)} USDG` })} />
                <NameTile brand="x402" name={`${s.label}.${s.x402.parent}`} status={s.x402.available} reason={"reason" in s.x402 ? s.x402.reason : ""}
                  price={s.x402.available === true ? `${trimEth(s.x402.feeWei)} ETH + gas` : ""} sub="Ethereum · x402 Identity"
                  selected={pick?.kind === "new" && pick.brand === "x402" && pick.label === s.label && pick.parent === s.x402.parent}
                  onSelect={() => s.x402.available === true && choose({ kind: "new", brand: "x402", label: s.label, parent: s.x402.parent, price: `${trimEth(s.x402.feeWei)} ETH` })} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {pick?.kind === "new" && <RegisterPanel pick={pick} onDone={(name) => { setOwnInput(name); choose({ kind: "own", name }); }} onCancel={() => choose(null)} />}

      {/* ---- A name they already own ---- */}
      {pick?.kind !== "new" && (
        <section className="space-y-4">
          {!pick && <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-ink-3"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>}
          <OwnName d={d} origin={origin} value={ownInput} onChange={setOwnInput} picked={pick?.kind === "own" ? pick.name : null}
            onUse={(name) => choose(name ? { kind: "own", name } : null)} />
        </section>
      )}

      {!pick && (
        <p className="text-center text-sm text-ink-3">
          No name yet? You can <strong>skip</strong> and add one later from the dashboard. Buyers will see only your wallet address until then.
        </p>
      )}
    </div>
  );
}

function trimEth(wei: string) {
  const s = formatEther(BigInt(wei));
  const [w, f = ""] = s.split(".");
  return f ? `${w}.${f.slice(0, 5).replace(/0+$/, "") || "0"}` : w!;
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-2">
          <div className="h-[74px] animate-pulse rounded-xl border border-line bg-card" />
          <div className="h-[74px] animate-pulse rounded-xl border border-line bg-card" />
        </div>
      ))}
    </>
  );
}

function NameTile({ brand, name, status, reason, price, sub, selected, onSelect }: {
  brand: Brand; name: string; status: boolean | null; reason: string; price: string; sub: string; selected: boolean; onSelect: () => void;
}) {
  const ok = status === true;
  return (
    <button type="button" onClick={onSelect} disabled={!ok} aria-pressed={selected}
      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? "border-ink bg-card ring-1 ring-ink" : ok ? "border-line hover:border-ink-3" : "cursor-not-allowed border-line opacity-55"}`}>
      <BrandIcon brand={brand} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block break-all font-mono text-[0.92rem] leading-snug">{name}</span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className={ok ? "font-semibold text-ink" : "text-ink-3"}>{ok ? price : status === false ? "Taken" : "Couldn't check"}</span>
          <span className="text-ink-3">{ok ? sub : status === false ? (reason && reason !== "Taken" ? reason : "") : reason}</span>
        </span>
      </span>
      {ok && <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${selected ? "border-ink bg-ink text-bg" : "border-line text-transparent"}`}>✓</span>}
    </button>
  );
}

/** Register the picked name, then write its records. Two clear steps, nothing hidden. */
function RegisterPanel({ pick, onDone, onCancel }: { pick: Extract<Pick, { kind: "new" }>; onDone: (name: string) => void; onCancel: () => void }) {
  const name = fullName(pick);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [name]);
  return (
    <section ref={ref} className="card scroll-mt-24 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-card px-5 py-4">
        <BrandIcon brand={pick.brand} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-lg">{name}</div>
          <div className="text-sm text-ink-3">{pick.brand === "hoodfi" ? "HoodFi Names · Robinhood Chain" : "x402 Identity · Ethereum"} · {pick.price}</div>
        </div>
        <button type="button" onClick={onCancel} className="btn btn-ghost py-1.5 text-sm">Change</button>
      </div>
      <div className="p-5">
        {pick.brand === "hoodfi" ? (
          <>
            <Step n={1} title={`Register ${name}`} sub="Paid in USDG over x402 with one signature. No gas. The name goes to the wallet that signs." />
            <TryIt slug="hoodfi-names" method="POST" pathAndQuery="/register" pricing="contract" priceLabel={pick.price}
              nameEntry={{ suffix: ".hoodfi.eth", initial: pick.label, locked: true, cta: `Register ${name} · ${pick.price}` }}
              onPaid={(body) => {
                const n = (body as { name?: unknown })?.name;
                if (typeof n === "string" && n.endsWith(".hoodfi.eth")) onDone(n);
              }} />
            <p className="mt-3 text-xs text-ink-3">Next you&apos;ll point it at this listing in one Robinhood Chain transaction.</p>
          </>
        ) : (
          <MintX402 pick={pick} onDone={onDone} />
        )}
      </div>
    </section>
  );
}

function Step({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-3 flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-xs text-bg">{n}</span>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-ink-3">{sub}</div>
      </div>
    </div>
  );
}

/** Mints an x402 Identity name directly through the registrar (no platform fee). */
function MintX402({ pick, onDone }: { pick: Extract<Pick, { kind: "new" }>; onDone: (name: string) => void }) {
  const { address, chainId, isConnected } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: walletClient } = useWalletClient({ chainId: mainnet.id });
  const [stage, setStage] = useState<"idle" | "signing" | "confirming" | "minted" | "error">("idle");
  const [err, setErr] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const name = fullName(pick);
  const parent = X402ID_PARENTS.find((p) => p.label === pick.parent)!;

  const mint = async () => {
    if (!isConnected || !address) { open(); return; }
    setErr("");
    try {
      if (chainId !== mainnet.id) await switchChainAsync({ chainId: mainnet.id });
      if (!publicClient || !walletClient) throw new Error("Your wallet is not ready on Ethereum yet. Try again.");
      setStage("signing");
      const h = await registerVia({ registrar: X402ID_REGISTRAR, forwarder: X402ID_FORWARDER, publicClient: publicClient as never }, walletClient as never, {
        parentNode: parent.node, label: pick.label, platformTreasury: NO_FEE_TREASURY, platformFee: 0n, user: getAddress(address),
      });
      setHash(h);
      setStage("confirming");
      const r = await publicClient.waitForTransactionReceipt({ hash: h });
      if (r.status !== "success") throw new Error("The registration reverted. The name may have just been taken.");
      setStage("minted");
      onDone(name);
    } catch (e) {
      const x = e as { shortMessage?: string; message?: string };
      setErr(x.shortMessage ?? x.message ?? "Registration failed");
      setStage("error");
    }
  };
  return (
    <>
      <Step n={1} title={`Register ${name}`} sub={`${pick.price} mint fee plus Ethereum gas, from the wallet you connect. x402Fi adds no fee.`} />
      <button className="btn btn-primary w-full" onClick={mint} disabled={stage === "signing" || stage === "confirming" || stage === "minted"}>
        {!isConnected ? "Connect wallet" : stage === "signing" ? "Confirm in your wallet…" : stage === "confirming" ? "Registering on Ethereum…" : stage === "minted" ? "Registered ✓" : chainId !== mainnet.id ? `Switch to Ethereum and register` : `Register ${name} · ${pick.price}`}
      </button>
      {hash && <a className="mt-2 block text-center text-sm underline" href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a>}
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
      <p className="mt-3 text-xs text-ink-3">Next you&apos;ll point it at this listing and your wallet in one more Ethereum transaction.</p>
    </>
  );
}

/** A name the seller owns (or just registered): check it, and write records only if needed. */
function OwnName({ d, origin, value, onChange, picked, onUse }: { d: Draft; origin: string; value: string; onChange: (v: string) => void; picked: string | null; onUse: (name: string | null) => void }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const name = value.trim().toLowerCase();
  const hoodfi = name.endsWith(".hoodfi.eth");
  const valid = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(name);

  const run = async (n = name) => {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(n)) { setErr("Enter a full name, like acme.hoodfi.eth or acme.402api.eth."); return; }
    if (!isAddress(d.payTo, { strict: false })) { setErr("Set your payout wallet on the Endpoints step first."); return; }
    setErr(""); setChecking(true);
    const qs = new URLSearchParams({ name: n, payTo: d.payTo, ...(d.native ? { upstream: d.upstreamUrl } : {}) });
    const r = await fetch(`/api/names/check?${qs}`, { signal: AbortSignal.timeout(20_000) }).then((r) => r.json() as Promise<Check & { error?: string; holder?: { status: number; error: string } | null }>).catch(() => null);
    setChecking(false);
    if (!r || r.error) { setErr(r?.error ?? "Could not check right now."); return; }
    // Publishing requires the signed-in wallet to hold the name. A failed read (503) is
    // not a "no": let them continue, and publishing checks again.
    if (r.holder && r.holder.status !== 503) { setErr(r.holder.error); onUse(null); setCheck(null); return; }
    setCheck(r);
    onUse(n);
  };
  // A name chosen or registered upstream is checked right away.
  useEffect(() => {
    if (picked && picked === name && !check && !checking) void run(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  return (
    <div className="space-y-4">
      {!picked && (
        <div>
          <div className="eyebrow">I already own a name</div>
          <div className="mt-2 flex gap-2">
            <input className="field" value={value} onChange={(e) => { onChange(e.target.value); setCheck(null); }} onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="acme.hoodfi.eth or acme.402api.eth" spellCheck={false} autoCapitalize="none" aria-label="Your name" />
            <button className="btn btn-ghost shrink-0" onClick={() => run()} disabled={!valid || checking}>{checking ? "Checking…" : "Check"}</button>
          </div>
          <p className="mt-1.5 text-sm text-ink-3">Any HoodFi name or ENS name held by the wallet you signed in with. We read its records first: if it&apos;s already set up for this listing, there is nothing to sign.</p>
        </div>
      )}
      {err && <p className="text-sm text-bad">{err}</p>}
      {picked && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line bg-card px-5 py-4">
            <BrandIcon brand={hoodfi ? "hoodfi" : "x402"} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-lg">{picked}</div>
              <div className="text-sm text-ink-3">
                {checking ? "Reading its records…" : check?.state === "verified" ? "Set up for this listing" : check?.state === "mismatch" ? "Needs one transaction" : check ? "Couldn't check right now" : ""}
              </div>
            </div>
            <button type="button" onClick={() => { onUse(null); setCheck(null); }} className="btn btn-ghost py-1.5 text-sm">Change</button>
          </div>
          <div className="p-5">
            {check?.state === "verified" ? (
              <p className="flex items-start gap-2 text-good"><span aria-hidden>✓</span><span><strong>{picked}</strong> already points at this listing and pays <span className="font-mono">{d.payTo.slice(0, 6)}…{d.payTo.slice(-4)}</span>. Nothing to sign. Continue.</span></p>
            ) : check ? (
              <Records d={d} origin={origin} name={picked} hoodfi={hoodfi} reason={check.reasonText} owner={check.owner} onWritten={() => run(picked)} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Records({ d, origin, name, hoodfi, reason, owner, onWritten }: { d: Draft; origin: string; name: string; hoodfi: boolean; reason: string | null; owner: string | null; onWritten: () => void }) {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const ens = useWritePayee();
  const hf = useWriteHoodfiPayee();
  const writer = hoodfi ? hf : ens;
  const [showProfile, setShowProfile] = useState(false);
  const [prof, setProf] = useState({ avatar: "", url: "", x: "" });
  const c = <T,>(f: () => T) => { try { return { ok: true as const, v: f() }; } catch (e) { return { ok: false as const, msg: (e as Error).message }; } };
  const av = c(() => parseLogo(prof.avatar)), ur = c(() => parseWebsite(prof.url)), xh = c(() => parseXHandle(prof.x));
  const profOk = av.ok && ur.ok && xh.ok;
  const profile = { avatar: prof.avatar.trim() || undefined, url: ur.ok ? ur.v ?? undefined : undefined, twitter: xh.ok ? xh.v ?? undefined : undefined };
  const wrongWallet = hoodfi && owner && address && getAddress(owner) !== getAddress(address);
  const busy = ["reading", "signing", "confirming"].includes(writer.state);

  const go = async () => {
    if (!isConnected) { open(); return; }
    const ok = hoodfi ? await hf.write(name, origin, d.payTo, profile) : await ens.write(name, origin, d.payTo, profile, address ? getAddress(address) : undefined);
    if (ok) onWritten();
  };

  return (
    <div>
      {reason && <p className="mb-3 text-sm text-ink-2">{reason}</p>}
      <div className="rounded-lg bg-card p-4">
        <div className="eyebrow">One {hoodfi ? "Robinhood Chain" : "Ethereum"} transaction will set</div>
        <ul className="mt-2 space-y-1 text-sm">
          <li><span className="text-ink-3">Accepted at</span> <span className="font-mono">{origin}</span> <span className="text-ink-3">(other sites already on the name are kept)</span></li>
          <li><span className="text-ink-3">Pays</span> <span className="break-all font-mono">{d.payTo}</span> <span className="text-ink-3">on Robinhood Chain</span></li>
          {!hoodfi && address && <li><span className="text-ink-3">Resolves to</span> <span className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span> <span className="text-ink-3">on Ethereum and Base</span></li>}
          {profile.avatar && <li><span className="text-ink-3">Logo</span> <span className="break-all font-mono">{profile.avatar}</span></li>}
          {profile.url && <li><span className="text-ink-3">Website</span> <span className="font-mono">{profile.url}</span></li>}
          {profile.twitter && <li><span className="text-ink-3">X</span> <span className="font-mono">@{profile.twitter}</span></li>}
        </ul>
      </div>
      <button type="button" className="mt-3 text-sm underline" onClick={() => setShowProfile((v) => !v)}>{showProfile ? "Hide profile" : "Add a logo, website and X (optional)"}</button>
      {showProfile && (
        <div className="mt-3 grid gap-3">
          {([["avatar", "Logo (https:// or ipfs:// PNG, JPEG, WebP or GIF)", "https://yourco.com/logo.png", av], ["url", "Website", "https://yourco.com", ur], ["x", "X profile", "@yourco", xh]] as const).map(([k, label, ph, r]) => (
            <label key={k} className="block">
              <span className="text-sm text-ink-2">{label}</span>
              <input className="field mt-1" value={prof[k]} placeholder={ph} spellCheck={false} autoCapitalize="none" onChange={(e) => setProf((p) => ({ ...p, [k]: e.target.value }))} />
              {!r.ok && <span className="mt-1 block text-xs text-bad">{r.msg}</span>}
            </label>
          ))}
          <p className="text-xs text-ink-3">Shown on your listing with a verified mark: only the name&apos;s owner can set these. Leave blank to keep what the name has.</p>
        </div>
      )}
      {wrongWallet && <p className="mt-3 text-sm text-bad">This name belongs to <span className="font-mono">{owner!.slice(0, 6)}…{owner!.slice(-4)}</span>. Connect that wallet to sign.</p>}
      <button className="btn btn-primary mt-4 w-full" disabled={!profOk || busy || !!wrongWallet || writer.state === "written"} onClick={go}>
        {!isConnected ? "Connect wallet" : writer.state === "reading" ? "Reading records…" : writer.state === "signing" ? "Confirm in your wallet…" : writer.state === "confirming" ? (hoodfi ? "Waiting for Robinhood Chain…" : "Waiting for Ethereum…") : writer.state === "written" ? "Written ✓ · checking…" : `Set up ${name}`}
      </button>
      {writer.hash && <a className="mt-2 block text-center text-sm underline" href={hoodfi ? `https://robinhoodchain.blockscout.com/tx/${writer.hash}` : `https://etherscan.io/tx/${writer.hash}`} target="_blank" rel="noreferrer">View transaction</a>}
      {writer.error && <p className="mt-3 text-sm text-bad">{writer.error}</p>}
      <p className="mt-3 text-xs text-ink-3">You can also continue now and do this later from the dashboard. The badge appears once the records are onchain.</p>
    </div>
  );
}
