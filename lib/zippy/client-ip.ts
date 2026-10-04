export const DEFAULT_TRUSTED_HOPS = 1;
export const MAX_TRUSTED_HOPS = 5;

// Number of trusted proxies in front of the app (ZIPPY_TRUSTED_PROXY_HOPS). Anything
// that is not an integer 0..5 falls back to the default of 1.
export function parseTrustedHops(raw: unknown): number {
  if (typeof raw !== "string" && typeof raw !== "number") return DEFAULT_TRUSTED_HOPS;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return DEFAULT_TRUSTED_HOPS;
  const value = Number(text);
  return value >= 0 && value <= MAX_TRUSTED_HOPS ? value : DEFAULT_TRUSTED_HOPS;
}

// The client is the entry `hops` positions from the right of x-forwarded-for: each trusted
// proxy appends the address it received the request from, so entries further left are
// client-controlled. hops 0 means no trusted proxy: the header is ignored entirely.
export function clientIpFromForwarded(header: string | null, hops: number): string | null {
  if (hops < 1 || !header) return null;
  const entries = header.split(",").map((entry) => entry.trim());
  if (entries.length < hops) return null;
  const ip = normalizeIp(entries[entries.length - hops]);
  return ip ? ip : null;
}

// Expands an IPv6 address to its 8 hextets (numbers 0..65535), or null when it is not a valid IPv6 address.
function ipv6Hextets(ip: string): number[] | null {
  let text = ip.split("%")[0];
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const octets = dotted.slice(2).map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    text = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const groups = [...head, ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  const missing = 8 - groups.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  return all.map((group) => parseInt(group, 16));
}

// So one client cannot get several buckets by varying the spelling: strip a port, unwrap
// "[v6]:port", lowercase, turn an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:hex:hex) into plain IPv4,
// and reduce any other IPv6 address to its /64 prefix (one household or range must not mint unlimited buckets).
function normalizeIp(entry: string): string {
  let ip = entry.toLowerCase();
  const bracketed = /^\[([^\]]*)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  const hextets = ipv6Hextets(ip);
  if (!hextets) return ip;
  if (hextets.slice(0, 5).every((value) => value === 0) && hextets[5] === 0xffff) {
    return [hextets[6] >> 8, hextets[6] & 255, hextets[7] >> 8, hextets[7] & 255].join(".");
  }
  return `${hextets.slice(0, 4).map((value) => value.toString(16)).join(":")}::/64`;
}
