// Defence in depth: the Auth ban is the real gate, but a verified session whose profile is not
// approved must still never reach customer or Zippy APIs.
export function guardProfile(
  profile: { role?: unknown; approval_status?: unknown } | null
): { ok: true } | { ok: false; reason: "unapproved" | "missing" } {
  if (!profile) return { ok: false, reason: "missing" };
  return profile.approval_status === "approved" ? { ok: true } : { ok: false, reason: "unapproved" };
}
