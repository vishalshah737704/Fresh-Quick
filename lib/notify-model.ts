// Pure notification model (C4). Imports nothing at runtime so node's test runner can load it;
// mobile/lib/notify-model.ts is a byte-identical copy (parity-tested).

export type NotificationCategory = "order" | "wallet" | "promo" | "account";

export type InboxNotification = {
  id: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  orderId: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationPreferences = {
  orderUpdates: boolean;
  walletUpdates: boolean;
  promotions: boolean;
  push: boolean;
  sms: boolean;
  whatsapp: boolean;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  orderUpdates: true,
  walletUpdates: true,
  promotions: true,
  push: true,
  sms: false,
  whatsapp: false,
};

export type RawPreferencesRow = {
  order_updates: boolean;
  wallet_updates: boolean;
  promotions: boolean;
  push: boolean;
  sms: boolean;
  whatsapp: boolean;
};

export function toPreferences(row: RawPreferencesRow | null | undefined): NotificationPreferences {
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    orderUpdates: row.order_updates,
    walletUpdates: row.wallet_updates,
    promotions: row.promotions,
    push: row.push,
    sms: row.sms,
    whatsapp: row.whatsapp,
  };
}

const PREFERENCE_COLUMNS: Record<keyof NotificationPreferences, string> = {
  orderUpdates: "order_updates",
  walletUpdates: "wallet_updates",
  promotions: "promotions",
  push: "push",
  sms: "sms",
  whatsapp: "whatsapp",
};

// Accepts a partial body; every provided value must be a boolean. Unknown keys are rejected.
export function validatePreferencesPatch(
  body: unknown
): { ok: true; patch: Record<string, boolean> } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Invalid request" };
  const patch: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const column = (PREFERENCE_COLUMNS as Record<string, string | undefined>)[key];
    if (!column) return { ok: false, error: `Unknown setting: ${key}` };
    if (typeof value !== "boolean") return { ok: false, error: `${key} must be true or false` };
    patch[column] = value;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change" };
  return { ok: true, patch };
}

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/;

export function validateDeviceToken(
  token: unknown,
  platform: unknown
): { ok: true; token: string; platform: "ios" | "android" } | { ok: false; error: string } {
  if (typeof token !== "string" || !EXPO_TOKEN.test(token.trim())) return { ok: false, error: "Invalid push token" };
  if (platform !== "ios" && platform !== "android") return { ok: false, error: "Platform must be ios or android" };
  return { ok: true, token: token.trim(), platform };
}

export type DispatchMessage =
  | { channel: "push"; to: string; title: string; body: string; data: { orderId: string | null; kind: string } }
  | { channel: "sms" | "whatsapp"; to: string; title: string; body: string };

export type DispatchEnv = { smsEnabled: boolean; whatsappEnabled: boolean };

// Decides which channels a stored inbox row is delivered on. The inbox row itself is the
// "in-app" channel and always exists; this only plans the extra channels.
export function planDispatch(
  note: { title: string; body: string; kind: string; orderId: string | null },
  prefs: NotificationPreferences,
  tokens: string[],
  phone: string | null,
  env: DispatchEnv
): DispatchMessage[] {
  const out: DispatchMessage[] = [];
  if (prefs.push) {
    for (const token of tokens) {
      out.push({ channel: "push", to: token, title: note.title, body: note.body, data: { orderId: note.orderId, kind: note.kind } });
    }
  }
  const e164 = phone && /^\+\d{8,15}$/.test(phone) ? phone : null;
  if (e164 && prefs.sms && env.smsEnabled) out.push({ channel: "sms", to: e164, title: note.title, body: `${note.title}: ${note.body}` });
  if (e164 && prefs.whatsapp && env.whatsappEnabled) out.push({ channel: "whatsapp", to: e164, title: note.title, body: `${note.title}: ${note.body}` });
  return out;
}

export function unreadCount(items: Pick<InboxNotification, "read">[]): number {
  return items.reduce((n, item) => n + (item.read ? 0 : 1), 0);
}

export function describeAge(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
