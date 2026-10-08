// Builds the "how was your order?" email n8n sends one hour after delivery.
// Imports nothing at runtime so `node --test` can load it (escapeHtml is a deliberate small copy of lib/delivered-email.ts).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHttp(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";

export function buildReviewRequestEmail(input: {
  orderId: string;
  storeName: string;
  recipientName: string;
  orderUrl: string;
}): { subject: string; html: string } {
  const subject = `How was your order from ${input.storeName.replace(/[\r\n]+/g, " ")}?`;
  const link = isHttp(input.orderUrl)
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(input.orderUrl)}" style="${FONT}display:inline-block;background:#A85800;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:999px;">Rate your order</a></p>`
    : "";
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;"><tr><td align="center" style="padding:16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;"><tr><td style="padding:24px;">` +
    `<p style="margin:0 0 12px;${FONT}font-size:16px;color:#222222;">Hi ${escapeHtml(input.recipientName)},</p>` +
    `<p style="margin:0 0 12px;${FONT}font-size:16px;color:#222222;">Thanks for ordering from ${escapeHtml(input.storeName)} (order #${escapeHtml(input.orderId.slice(0, 8))}). We would love to hear how it went.</p>` +
    `<p style="margin:0;${FONT}font-size:14px;color:#444444;">You can rate the store, the dishes and the delivery in less than a minute.</p>` +
    link +
    `</td></tr></table></td></tr></table>`;
  return { subject, html };
}
