// Pure helpers for the registration-status endpoint.
export function ipBucket(ip: string | null, hash: (value: string) => string): string {
  return ip ? `regstatus:${hash(ip)}` : "regstatus:unknown";
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "" || value.length > 254 || !value.includes("@")) return null;
  return value;
}
