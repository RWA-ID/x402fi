/**
 * Guards the gateway against being used to reach private networks.
 *
 * A hostname blocklist alone is a false pass (31/32 tests green on a broken
 * draft once): IPv4-mapped IPv6 like ::ffff:127.0.0.1 and DNS names that
 * resolve to private space slip through. So we check literals in every
 * notation AND resolve names over DoH before fetching.
 */

export class UnsafeUrlError extends Error {}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return V4_BLOCKS.some(([base, bits]) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

/** Expands an IPv6 literal into 8 hextets, or null if it is not one. */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  s = s.split("%")[0];
  if (!s.includes(":")) return null;
  // Trailing dotted IPv4 (::ffff:1.2.3.4)
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) {
    const n = ipv4ToInt(m[2]);
    if (n === null) return null;
    s = `${m[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array(fill).fill("0"), ...tail];
  if (all.length !== 8 || !all.every((h) => /^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16));
}

export function isPrivateIPv6(ip: string): boolean {
  const h = expandIPv6(ip);
  if (!h) return false;
  if (h.every((x) => x === 0)) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
    const v4 = `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
    return isPrivateIPv4(v4) || h[5] === 0;
  }
  // NAT64 64:ff9b::/96 embedding a private v4
  if (h[0] === 0x64 && h[1] === 0xff9b) return isPrivateIPv4(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`);
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  return false;
}

const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i;

/** Syntactic checks. Throws UnsafeUrlError with a message a seller can act on. */
export function assertSafeUrlSyntax(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That is not a valid URL.");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError("Use an https:// URL.");
  if (u.username || u.password) throw new UnsafeUrlError("Remove the username/password from the URL.");
  if (u.port && u.port !== "443") throw new UnsafeUrlError("Only the standard HTTPS port (443) is supported.");
  const host = u.hostname.replace(/\.$/, "");
  if (!host.includes(".") && !host.includes(":")) throw new UnsafeUrlError("Use a public hostname.");
  if (BLOCKED_HOSTS.test(host)) throw new UnsafeUrlError("That host is not publicly reachable.");
  // Bare-integer / hex / octal IPv4 forms (http://2130706433) are normalized by URL to dotted form.
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) throw new UnsafeUrlError("Private network addresses are not allowed.");
  return u;
}

type Resolver = (host: string, type: "A" | "AAAA") => Promise<string[]>;

/** DNS over HTTPS via Cloudflare. */
export const dohResolver: Resolver = async (host, type) => {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!r.ok) throw new Error(`DoH ${r.status}`);
  const j = (await r.json()) as { Answer?: Array<{ type: number; data: string }> };
  const want = type === "A" ? 1 : 28;
  return (j.Answer ?? []).filter((a) => a.type === want).map((a) => a.data);
};

/** Full check: syntax, then every A/AAAA answer must be public. */
export async function assertSafeUrl(raw: string, resolve: Resolver = dohResolver): Promise<URL> {
  const u = assertSafeUrlSyntax(raw);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (ipv4ToInt(host) !== null || expandIPv6(host)) return u; // literal already checked
  const [a, aaaa] = await Promise.all([resolve(host, "A"), resolve(host, "AAAA")]);
  const ips = [...a, ...aaaa];
  if (ips.length === 0) throw new UnsafeUrlError("That hostname does not resolve.");
  if (ips.some((ip) => isPrivateIPv4(ip) || isPrivateIPv6(ip))) throw new UnsafeUrlError("That hostname points to a private network.");
  return u;
}
