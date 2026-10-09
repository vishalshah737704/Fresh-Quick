// Builds the three registration emails n8n sends. Imports nothing at runtime (escapeHtml is a small
// copy of the one in lib/delivered-email.ts).
export type RegistrationEmailEvent = "submitted" | "approved" | "rejected";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// https links, or http only for a local address; anything else is not rendered as a link.
export function isSafeLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function button(url: string, label: string): string {
  if (!isSafeLink(url)) return "";
  return `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#f58220;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:bold;">${escapeHtml(label)}</a></p>`;
}

export function buildRegistrationEmail(input: {
  event: RegistrationEmailEvent;
  brandName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  reason?: string;
  adminUrl: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml(input.fullName);
  const brand = escapeHtml(input.brandName);
  const wrap = (body: string) =>
    `<div style="${FONT}color:#13294b;max-width:560px;word-break:break-word;overflow-wrap:anywhere;">${body}</div>`;

  if (input.event === "submitted") {
    return {
      subject: `New registration awaiting approval: ${oneLine(input.fullName)}`,
      html: wrap(
        `<h2>New registration awaiting approval</h2>` +
          `<p>A customer is asking to register on ${brand}.</p>` +
          `<table cellpadding="4" style="${FONT}">` +
          `<tr><td><b>Name</b></td><td>${name}</td></tr>` +
          `<tr><td><b>Email</b></td><td>${escapeHtml(input.email)}</td></tr>` +
          `<tr><td><b>Phone</b></td><td>${escapeHtml(input.phone)}</td></tr>` +
          `<tr><td><b>Address</b></td><td>${escapeHtml(input.address)}</td></tr></table>` +
          `<p>Log in to the admin portal to approve or reject this request.</p>` +
          button(input.adminUrl, "Open registrations")
      ),
    };
  }
  if (input.event === "approved") {
    return {
      subject: `Your ${oneLine(input.brandName)} registration is approved`,
      html: wrap(
        `<h2>You're approved</h2>` +
          `<p>Hi ${name}, your registration on ${brand} has been approved.</p>` +
          `<p>You can now log in with the email and password you chose when you registered.</p>` +
          button(input.loginUrl, "Log in")
      ),
    };
  }
  return {
    subject: `Your ${oneLine(input.brandName)} registration was not approved`,
    html: wrap(
      `<h2>Registration not approved</h2>` +
        `<p>Hi ${name}, we could not approve your registration on ${brand}.</p>` +
        `<p><b>Reason:</b> ${escapeHtml(input.reason ?? "")}</p>` +
        `<p>You can register again with corrected details.</p>`
    ),
  };
}
