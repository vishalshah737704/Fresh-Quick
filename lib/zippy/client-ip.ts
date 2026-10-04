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

// So one client cannot get several buckets by varying the spelling: strip a port, unwrap
// "[v6]:port", lowercase, and turn an IPv4-mapped IPv6 address (::ffff:a.b.c.d) into plain IPv4.
function normalizeIp(entry: string): string {
  let ip = entry.toLowerCase();
  const bracketed = /^\[([^\]]*)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  return mapped ? mapped[1] : ip;
}
