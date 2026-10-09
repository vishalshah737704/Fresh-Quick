// Shared rules and wording for customer registration approval. Imports nothing at runtime so
// `node --test` can load it; the phone app gets a byte-identical copy in piece 2.
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RegistrationStatusAnswer = "pending" | "rejected" | "none";

export const REJECTION_REASON_MAX = 500;

export const REGISTRATION_PENDING_POPUP =
  "Your registration approval is in progress. We will email you once the admin has reviewed it.";
export const LOGIN_PENDING_MESSAGE = "Your registration is still awaiting admin approval.";
export const LOGIN_REJECTED_MESSAGE =
  "Your registration was rejected. Please check your email for the reason.";
export const ALREADY_PENDING_MESSAGE = "Your registration is already awaiting approval.";
export const ALREADY_REGISTERED_MESSAGE =
  "An account with this email already exists. Please log in.";
export const ZIPPY_LOGIN_REQUIRED_MESSAGE =
  "I am sorry I cannot respond to you till you register and log in. This is necessary to ensure that only validated people are allowed to use the Application & Chat.";

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

export function isApproved(status: unknown): boolean {
  return status === "approved";
}

// Tab (\t) and newline (\n) are allowed; every other control character is not. A Postgres text
// column rejects NUL and a lone UTF-16 surrogate with an error that would surface as a 500.
const BAD_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export function cleanRejectionReason(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "A reason is required" };
  const value = raw.trim();
  if (value === "") return { ok: false, error: "A reason is required" };
  if (value.length > REJECTION_REASON_MAX) {
    return { ok: false, error: `The reason must be ${REJECTION_REASON_MAX} characters or fewer` };
  }
  if (BAD_CONTROL.test(value) || LONE_SURROGATE.test(value)) {
    return { ok: false, error: "The reason contains characters that are not allowed" };
  }
  return { ok: true, value };
}

export function isBannedLoginError(message: string): boolean {
  return /banned/i.test(message);
}

export function statusAnswer(
  row: { role: string; approvalStatus: string } | null
): RegistrationStatusAnswer {
  if (!row || row.role !== "customer") return "none";
  if (row.approvalStatus === "pending") return "pending";
  if (row.approvalStatus === "rejected") return "rejected";
  return "none";
}

export function loginBlockMessage(answer: RegistrationStatusAnswer): string | null {
  if (answer === "pending") return LOGIN_PENDING_MESSAGE;
  if (answer === "rejected") return LOGIN_REJECTED_MESSAGE;
  return null;
}
