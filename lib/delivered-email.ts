import type { OrderDetail } from "./order-detail";

export const DELIVERED_GREETING =
  "Thank you for your order. Your order has been successfully delivered. Please let us know your experience.";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rupees(amount: number): string {
  return `₹${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const WRAP = "word-break:break-word;overflow-wrap:anywhere;";

function itemRow(
  item: OrderDetail["items"][number],
  isImageAllowed: (url: string) => boolean
): string {
  const showImage = item.imageUrl !== null && isHttps(item.imageUrl) && isImageAllowed(item.imageUrl);
  const image = showImage
    ? `<img src="${escapeHtml(item.imageUrl as string)}" width="56" height="56" alt="${escapeHtml(item.name)}" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:8px;" />`
    : "";
  const options = item.options.map((option) => escapeHtml(option.optionName)).join(", ");
  const optionsLine = options
    ? `<div style="font-size:13px;color:#666666;margin-top:2px;">${options}</div>`
    : "";
  const noteLine = item.specialInstructions
    ? `<div style="font-size:13px;color:#666666;margin-top:2px;font-style:italic;">&quot;${escapeHtml(item.specialInstructions)}&quot;</div>`
    : "";
  const lineTotal = rupees((Math.round(item.unitPrice * 100) * item.quantity) / 100);
  return (
    `<tr>` +
    `<td width="64" valign="top" style="padding:8px 8px 8px 0;border-bottom:1px solid #eeeeee;">${image}</td>` +
    `<td valign="top" style="padding:8px 0;border-bottom:1px solid #eeeeee;${FONT}${WRAP}font-size:15px;color:#222222;">` +
    `<div style="font-weight:bold;">${item.quantity}× ${escapeHtml(item.name)}</div>${optionsLine}${noteLine}</td>` +
    `<td valign="top" align="right" style="padding:8px 0 8px 8px;border-bottom:1px solid #eeeeee;${FONT}font-size:15px;color:#222222;white-space:nowrap;">${lineTotal}</td>` +
    `</tr>`
  );
}

function totalRow(label: string, amount: number, bold: boolean): string {
  const weight = bold ? "font-weight:bold;" : "";
  return (
    `<tr><td style="padding:4px 0;${FONT}font-size:15px;color:#222222;${weight}">${label}</td>` +
    `<td align="right" style="padding:4px 0;${FONT}font-size:15px;color:#222222;${weight}">${rupees(amount)}</td></tr>`
  );
}

export function buildDeliveredEmail(
  order: OrderDetail,
  isImageAllowed: (url: string) => boolean
): { subject: string; html: string } {
  const subject = `Your order from ${order.storeName.replace(/[\r\n]+/g, " ")} has been delivered`;
  const shortId = escapeHtml(order.id.slice(0, 8));
  const store = escapeHtml(order.storeName);

  const addressHtml = order.address
    ? [order.address.label, ...order.address.lines]
        .filter((line): line is string => Boolean(line))
        .map((line) => escapeHtml(line))
        .join("<br />")
    : "No delivery address on file";
  const noteHtml = order.deliveryNote
    ? `<p style="margin:12px 0 0;${FONT}font-size:14px;color:#444444;">Note: ${escapeHtml(order.deliveryNote)}</p>`
    : "";

  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;"><tr><td align="center" style="padding:16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;"><tr><td style="padding:24px;">` +
    `<p style="margin:0 0 12px;${FONT}font-size:16px;color:#222222;">Hi ${escapeHtml(order.recipientName)},</p>` +
    `<p style="margin:0 0 16px;${FONT}font-size:16px;color:#222222;">${escapeHtml(DELIVERED_GREETING)}</p>` +
    `<p style="margin:0 0 12px;${FONT}${WRAP}font-size:14px;color:#666666;">Order #${shortId} from ${store}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${order.items.map((item) => itemRow(item, isImageAllowed)).join("")}</table>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">` +
    totalRow("Subtotal", order.subtotal, false) +
    totalRow("Delivery fee", order.deliveryFee, false) +
    totalRow("Total", order.total, true) +
    `</table>` +
    `<p style="margin:20px 0 4px;${FONT}font-size:14px;font-weight:bold;color:#222222;">Delivered to</p>` +
    `<p style="margin:0;${FONT}${WRAP}font-size:14px;color:#444444;">${escapeHtml(order.recipientName)}<br />Phone: ${escapeHtml(order.recipientPhone)}<br />${addressHtml}</p>` +
    noteHtml +
    `</td></tr></table></td></tr></table>`;

  return { subject, html };
}
