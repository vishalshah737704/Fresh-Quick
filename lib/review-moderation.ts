// Pure patch builder for admin moderation. Imports nothing at runtime so `node --test` can load it.
// The 300-character limit mirrors REVIEW_LIMITS.reason in lib/reviews-model.ts.
export type ModerationAction = "hide" | "unhide" | "dismiss";
type Result = { ok: true; patch: Record<string, string | null> } | { ok: false; error: string };

export function buildModerationPatch(action: ModerationAction, reason: unknown, nowIso: string): Result {
  if (action === "unhide") return { ok: true, patch: { status: "visible", hidden_reason: null, hidden_at: null } };
  if (action === "dismiss") return { ok: true, patch: { reported_at: null } };
  if (typeof reason !== "string") return { ok: false, error: "Give a reason for hiding this review" };
  const trimmed = reason.trim();
  if (trimmed === "") return { ok: false, error: "Give a reason for hiding this review" };
  if (trimmed.includes("\u0000")) return { ok: false, error: "The reason contains an invalid character" };
  if ([...trimmed].length > 300) return { ok: false, error: "The reason must be at most 300 characters" };
  // The report (if any) is resolved by the hide; report_reason / reported_by stay for the audit trail.
  return { ok: true, patch: { status: "hidden", hidden_reason: trimmed, hidden_at: nowIso, reported_at: null } };
}
