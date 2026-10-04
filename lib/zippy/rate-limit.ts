import { createHash } from "node:crypto";
// Message texts live here (not in constants.ts) because node's test runner cannot resolve
// extensionless relative imports between .ts files.
export const LIMIT_DAY_MESSAGE = "You've reached today's Zippy limit. Please try again tomorrow.";
export const LIMIT_BUSY_MESSAGE = "Zippy is very busy right now. Please try again in a few minutes.";
function limitMinuteMessage(seconds: number): string {
  return `You're asking a little too fast. Please wait ${seconds} seconds and try again.`;
}

export type LimitKind = "minute" | "day" | "global";
export type Limit = { bucket: string; windowSeconds: number; limit: number; kind: LimitKind };

export const MINUTE_SECONDS = 60;
export const DAY_SECONDS = 86400;

// Defaults are the values Vishal can tune per deployment through the env names below.
const DEFAULTS = {
  userPerMin: 10,
  userPerDay: 60,
  visitorPerMin: 5,
  visitorPerDay: 20,
  globalVisitorsPerMin: 60,
  globalVisitorsPerDay: 1000,
  globalUsersPerMin: 120,
  globalUsersPerDay: 5000,
  allPerDay: 8000,
  ipBurstPerMin: 40,
} as const;

const ENV_NAMES: Record<keyof typeof DEFAULTS, string> = {
  userPerMin: "ZIPPY_LIMIT_USER_PER_MIN",
  userPerDay: "ZIPPY_LIMIT_USER_PER_DAY",
  visitorPerMin: "ZIPPY_LIMIT_VISITOR_PER_MIN",
  visitorPerDay: "ZIPPY_LIMIT_VISITOR_PER_DAY",
  globalVisitorsPerMin: "ZIPPY_LIMIT_GLOBAL_VISITORS_PER_MIN",
  globalVisitorsPerDay: "ZIPPY_LIMIT_GLOBAL_VISITORS_PER_DAY",
  globalUsersPerMin: "ZIPPY_LIMIT_GLOBAL_USERS_PER_MIN",
  globalUsersPerDay: "ZIPPY_LIMIT_GLOBAL_USERS_PER_DAY",
  allPerDay: "ZIPPY_LIMIT_ALL_PER_DAY",
  ipBurstPerMin: "ZIPPY_LIMIT_IP_BURST_PER_MIN",
};

export type Limits = { -readonly [K in keyof typeof DEFAULTS]: number };

const MAX_LIMIT = 1_000_000;

// An integer 1..1,000,000, otherwise the default: a typo can never switch a limit off.
function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return fallback;
  const value = Number(text);
  return value >= 1 && value <= MAX_LIMIT ? value : fallback;
}

export function readLimits(env: Record<string, string | undefined>): Limits {
  const out: Limits = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    out[key] = parseLimit(env[ENV_NAMES[key]], DEFAULTS[key]);
  }
  return out;
}

function hashIp(ip: string | null): string {
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : "unknown";
}

// Checked BEFORE authentication, for every caller, so floods cost no auth or database lookups.
export function preAuthPlan(ip: string | null): Limit[] {
  const limits = readLimits(process.env);
  return [
    { bucket: `ipburst:${hashIp(ip)}:min`, windowSeconds: MINUTE_SECONDS, limit: limits.ipBurstPerMin, kind: "minute" },
  ];
}

// Per-identity buckets, then the global bucket for that kind of caller, then the overall ceiling.
// The first bucket over its limit stops the request.
export function rateLimitPlan(args: { userId: string | null; ip: string | null }): Limit[] {
  const { userId, ip } = args;
  const limits = readLimits(process.env);
  const ceiling: Limit = { bucket: "all:day", windowSeconds: DAY_SECONDS, limit: limits.allPerDay, kind: "global" };
  if (userId) {
    return [
      { bucket: `user:${userId}:min`, windowSeconds: MINUTE_SECONDS, limit: limits.userPerMin, kind: "minute" },
      { bucket: `user:${userId}:day`, windowSeconds: DAY_SECONDS, limit: limits.userPerDay, kind: "day" },
      { bucket: "users:all:min", windowSeconds: MINUTE_SECONDS, limit: limits.globalUsersPerMin, kind: "global" },
      { bucket: "users:all:day", windowSeconds: DAY_SECONDS, limit: limits.globalUsersPerDay, kind: "global" },
      ceiling,
    ];
  }
  const id = hashIp(ip);
  return [
    { bucket: `ip:${id}:min`, windowSeconds: MINUTE_SECONDS, limit: limits.visitorPerMin, kind: "minute" },
    { bucket: `ip:${id}:day`, windowSeconds: DAY_SECONDS, limit: limits.visitorPerDay, kind: "day" },
    { bucket: "visitors:all:min", windowSeconds: MINUTE_SECONDS, limit: limits.globalVisitorsPerMin, kind: "global" },
    { bucket: "visitors:all:day", windowSeconds: DAY_SECONDS, limit: limits.globalVisitorsPerDay, kind: "global" },
    ceiling,
  ];
}

// Same fixed-window arithmetic as the SQL function: window start = floor(epoch / w) * w.
export function retryAfterSeconds(windowSeconds: number, nowMs: number): number {
  const epoch = Math.floor(nowMs / 1000);
  const next = (Math.floor(epoch / windowSeconds) + 1) * windowSeconds;
  return Math.max(1, next - epoch);
}

export function limitMessage(kind: LimitKind, retryAfter: number): string {
  if (kind === "minute") return limitMinuteMessage(retryAfter);
  if (kind === "day") return LIMIT_DAY_MESSAGE;
  return LIMIT_BUSY_MESSAGE;
}
