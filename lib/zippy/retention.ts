export const DEFAULT_RETENTION_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 3650;

export function parseRetentionDays(raw: unknown, fallback = DEFAULT_RETENTION_DAYS): number {
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string" && /^\s*\d+\s*$/.test(raw)) {
    value = Number(raw);
  } else {
    return fallback;
  }
  return Number.isInteger(value) && value >= MIN_DAYS && value <= MAX_DAYS ? value : fallback;
}

// A purge really deletes only when the caller says so explicitly.
export function parseDryRun(body: unknown): boolean {
  if (typeof body === "object" && body !== null && (body as { dryRun?: unknown }).dryRun === false) {
    return false;
  }
  return true;
}
