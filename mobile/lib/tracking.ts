// Pure helpers for the order tracking map. No imports so node's test runner can
// load this file directly.

export type TrackPoint = { lat: number; lng: number };

export type TrackingInput = {
  status: string;
  store: TrackPoint | null;
  destination: TrackPoint | null;
  partner: TrackPoint | null;
};

export type TrackingView = {
  store: TrackPoint | null;
  destination: TrackPoint | null;
  // Only while the order is assigned or picked up and a ping exists.
  partner: TrackPoint | null;
  // Live statuses with no usable ping yet.
  waiting: boolean;
  // Delivered: final route, no partner marker.
  final: boolean;
};

const LIVE_STATUSES = ["assigned", "picked_up"];

// The order page shows the map for these statuses only.
export function showTrackingMap(status: string): boolean {
  return LIVE_STATUSES.includes(status) || status === "delivered";
}

// Accepts numbers or numeric strings; null, "" and NaN give null (Number(null) is 0).
export function toTrackPoint(lat: unknown, lng: unknown): TrackPoint | null {
  const parse = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const la = parse(lat);
  const ln = parse(lng);
  if (la === null || ln === null) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

export function trackingView(input: TrackingInput): TrackingView {
  const live = LIVE_STATUSES.includes(input.status);
  const partner = live ? input.partner : null;
  return {
    store: input.store,
    destination: input.destination,
    partner,
    waiting: live && partner === null,
    final: input.status === "delivered",
  };
}

// Changes only when the set of points changes in a way that needs a refit
// (a point appears, disappears or moves for store/destination). The partner's
// own movement is deliberately not part of it, so the customer can pan and zoom.
export function fitKey(view: TrackingView): string {
  const part = (p: TrackPoint | null) => (p ? `${p.lat},${p.lng}` : "-");
  return `${part(view.store)}|${part(view.destination)}|${view.partner ? "p" : "-"}`;
}

const STALE_PING_MS = 5 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Updated hh:mm:ss" for a fresh ping; a ping older than 5 minutes shows its
// date and a warning so an old position is not mistaken for a live one.
export function formatUpdatedAt(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (now - date.getTime() > STALE_PING_MS) {
    return `Last seen ${date.getDate()} ${MONTHS[date.getMonth()]} ${time} (location may be out of date)`;
  }
  return `Updated ${time}`;
}
