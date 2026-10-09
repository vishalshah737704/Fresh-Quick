// Pure helpers for the registration-status endpoint.
export function ipBucket(ip: string | null, hash: (value: string) => string): string {
  return ip ? `regstatus:${hash(ip)}` : "regstatus:unknown";
}

export const DEFAULT_STATUS_LIMIT = 20;

// Per-minute cap for the status endpoint. Anything but an integer 1..1000000 falls back to the default, never "off".
export function parseStatusLimit(raw: unknown): number {
  if (typeof raw !== "string" && typeof raw !== "number") return DEFAULT_STATUS_LIMIT;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return DEFAULT_STATUS_LIMIT;
  const value = Number(text);
  return value >= 1 && value <= 1000000 ? value : DEFAULT_STATUS_LIMIT;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "" || value.length > 254 || !value.includes("@")) return null;
  return value;
}
