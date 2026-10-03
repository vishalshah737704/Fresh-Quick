import { createHash } from "node:crypto";

type Limit = { bucket: string; windowSeconds: number; limit: number };

// Daily cap per signed-in user is a default Vishal can change here.
const USER_LIMITS = { perMinute: 20, perDay: 100 };
const VISITOR_LIMITS = { perMinute: 10, perDay: 40 };

export function rateLimitPlan(args: { userId: string | null; ip: string | null }): Limit[] {
  const { userId, ip } = args;
  if (userId) {
    return [
      { bucket: `user:${userId}:min`, windowSeconds: 60, limit: USER_LIMITS.perMinute },
      { bucket: `user:${userId}:day`, windowSeconds: 86400, limit: USER_LIMITS.perDay },
    ];
  }
  const id = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : "unknown";
  return [
    { bucket: `ip:${id}:min`, windowSeconds: 60, limit: VISITOR_LIMITS.perMinute },
    { bucket: `ip:${id}:day`, windowSeconds: 86400, limit: VISITOR_LIMITS.perDay },
  ];
}
