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
  const ip = entries[entries.length - hops];
  return ip ? ip : null;
}
