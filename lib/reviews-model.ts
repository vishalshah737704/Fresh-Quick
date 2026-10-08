// Shared by the web and phone reviews features.
// mobile/lib/reviews-model.ts is a byte-identical copy (tests/mobile-parity.test.mjs guards drift), so this file imports nothing.

export const REVIEW_LIMITS = {
  storeComment: 1000,
  dishComment: 500,
  partnerComment: 500,
  reply: 600,
  reason: 300,
  photoBytes: 3 * 1024 * 1024,
} as const;

export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PARTNER_SCORE_MIN_RATINGS = 5;
export const LOW_PARTNER_SCORE = 3.0;
export const REVIEWS_PAGE_SIZE = 10;
const MAX_DISH_RATINGS = 50;

export const storeReviewsPath = (storeId: string): string => `/api/stores/${storeId}/reviews`;
export const storeRatingPath = (storeId: string): string => `/api/stores/${storeId}/rating`;
export const orderReviewPath = (orderId: string): string => `/api/customer/orders/${orderId}/review`;
export const reportReviewPath = (reviewId: string): string => `/api/customer/reviews/${reviewId}/report`;
export const reviewPhotoPath = (reviewId: string): string => `/api/reviews/${reviewId}/photo`;
export const DELIVERY_RATING_PATH = "/api/delivery/rating";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type ReviewDishInput = { productId: string; stars: number; comment: string | null };
export type ReviewInput = {
  storeStars: number;
  storeComment: string | null;
  dishes: ReviewDishInput[];
  partner: { stars: number; comment: string | null } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseStars(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

// Whitespace-only text means "no comment". A NUL byte is refused here because Postgres rejects it (it would be a 500).
// A lone UTF-16 surrogate is valid JS but Postgres rejects it (a 500), so refuse it up front.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function cleanComment(value: unknown, max: number): Parsed<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Comment must be text" };
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.includes("\u0000")) return { ok: false, error: "Comment contains an invalid character" };
  if (LONE_SURROGATE.test(trimmed)) return { ok: false, error: "Comment contains an invalid character" };
  if ([...trimmed].length > max) return { ok: false, error: `Comment must be at most ${max} characters` };
  return { ok: true, value: trimmed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateReviewPayload(
  raw: unknown,
  ctx: { orderProductIds: string[]; hasPartner: boolean }
): Parsed<ReviewInput> {
  if (!isRecord(raw)) return { ok: false, error: "Invalid review" };
  const storeStars = parseStars(raw.storeStars);
  if (storeStars === null) return { ok: false, error: "Rate the store from 1 to 5 stars" };
  const storeComment = cleanComment(raw.storeComment, REVIEW_LIMITS.storeComment);
  if (!storeComment.ok) return storeComment;

  const allowed = new Set(ctx.orderProductIds.map((id) => id.toLowerCase()));
  const dishes: ReviewDishInput[] = [];
  if (raw.dishes !== undefined && raw.dishes !== null) {
    if (!Array.isArray(raw.dishes)) return { ok: false, error: "Dishes must be a list" };
    if (raw.dishes.length > MAX_DISH_RATINGS) return { ok: false, error: "Too many dish ratings" };
    const seen = new Set<string>();
    for (const entry of raw.dishes) {
      if (!isRecord(entry)) return { ok: false, error: "Invalid dish rating" };
      const productId = typeof entry.productId === "string" ? entry.productId.toLowerCase() : "";
      if (!UUID.test(productId) || !allowed.has(productId)) return { ok: false, error: "A rated dish is not part of this order" };
      if (seen.has(productId)) return { ok: false, error: "A dish was rated twice" };
      seen.add(productId);
      const stars = parseStars(entry.stars);
      if (stars === null) return { ok: false, error: "Rate each dish from 1 to 5 stars" };
      const comment = cleanComment(entry.comment, REVIEW_LIMITS.dishComment);
      if (!comment.ok) return comment;
      dishes.push({ productId, stars, comment: comment.value });
    }
  }

  let partner: ReviewInput["partner"] = null;
  if (raw.partner !== undefined && raw.partner !== null) {
    if (!ctx.hasPartner) return { ok: false, error: "This order has no delivery partner to rate" };
    if (!isRecord(raw.partner)) return { ok: false, error: "Invalid delivery partner rating" };
    const stars = parseStars(raw.partner.stars);
    if (stars === null) return { ok: false, error: "Rate the delivery partner from 1 to 5 stars" };
    const comment = cleanComment(raw.partner.comment, REVIEW_LIMITS.partnerComment);
    if (!comment.ok) return comment;
    partner = { stars, comment: comment.value };
  }

  return { ok: true, value: { storeStars, storeComment: storeComment.value, dishes, partner } };
}

// "First name + last initial". Never an email or a phone-like string.
export function reviewerDisplayName(fullName: string | null | undefined): string {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Customer";
  if (words.some((word) => word.includes("@") || /\d{5,}/.test(word))) return "Customer";
  if (words.length === 1) return words[0];
  const initial = [...words[words.length - 1]][0];
  return `${words[0]} ${initial.toUpperCase()}.`;
}

// Integer sum and count in, one decimal out (half up, like SQL round(numeric, 1)).
export function averageOf(sum: number, count: number): number | null {
  if (!Number.isFinite(sum) || !Number.isFinite(count) || count <= 0) return null;
  return Math.round((sum * 10) / count) / 10;
}

export function buildHistogram(stars: number[]): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const value of stars) {
    if (Number.isInteger(value) && value >= 1 && value <= 5) out[value - 1] += 1;
  }
  return out;
}

export type PartnerScore = { isNew: true } | { isNew: false; average: number; count: number };

export function partnerScore(sum: number, count: number): PartnerScore {
  const average = count >= PARTNER_SCORE_MIN_RATINGS ? averageOf(sum, count) : null;
  return average === null ? { isNew: true } : { isNew: false, average, count };
}

export function isLowPartnerScore(sum: number, count: number): boolean {
  const average = count >= PARTNER_SCORE_MIN_RATINGS ? averageOf(sum, count) : null;
  return average !== null && average < LOW_PARTNER_SCORE;
}

// ---- Row shapers (allow-lists: every field is named, nothing is spread) ----

type OneOrMany<T> = T | T[] | null | undefined;

function first<T>(value: OneOrMany<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export const REVIEW_SELECT =
  "id, store_id, rating, comment, photo_path, status, vendor_reply, vendor_reply_at, created_at, " +
  "reported_at, report_reason, reported_by, hidden_reason, hidden_at, " +
  "customer:users!customer_id(full_name), stores(name), " +
  "review_dishes(stars, comment, products(name)), review_partner(stars, comment)";

export type RawReviewRow = {
  id: string;
  store_id: string;
  rating: number;
  comment: string | null;
  photo_path: string | null;
  status: "visible" | "hidden";
  vendor_reply: string | null;
  vendor_reply_at: string | null;
  created_at: string;
  reported_at: string | null;
  report_reason: string | null;
  reported_by: string | null;
  hidden_reason: string | null;
  hidden_at: string | null;
  customer: OneOrMany<{ full_name: string | null }>;
  stores?: OneOrMany<{ name: string }>;
  review_dishes: { stars: number; comment: string | null; products: OneOrMany<{ name: string }> }[] | null;
  review_partner: OneOrMany<{ stars: number; comment: string | null }>;
};

function dishName(entry: { products: OneOrMany<{ name: string }> }): string {
  return first(entry.products)?.name ?? "Dish";
}

export type PublicReview = {
  id: string;
  reviewerName: string;
  stars: number;
  comment: string | null;
  photoUrl: string | null;
  dishes: { name: string; stars: number }[];
  createdAt: string;
  vendorReply: string | null;
  vendorReplyAt: string | null;
};

export function toPublicReview(row: RawReviewRow, photoUrl: string | null): PublicReview {
  return {
    id: row.id,
    reviewerName: reviewerDisplayName(first(row.customer)?.full_name),
    stars: row.rating,
    comment: row.comment,
    photoUrl,
    dishes: (row.review_dishes ?? []).map((entry) => ({ name: dishName(entry), stars: entry.stars })),
    createdAt: row.created_at,
    vendorReply: row.vendor_reply,
    vendorReplyAt: row.vendor_reply_at,
  };
}

export type OwnReview = {
  id: string;
  status: "visible" | "hidden";
  stars: number;
  comment: string | null;
  photoUrl: string | null;
  dishes: { name: string; stars: number; comment: string | null }[];
  partner: { stars: number; comment: string | null } | null;
  createdAt: string;
  vendorReply: string | null;
};

export function toOwnReview(row: RawReviewRow, photoUrl: string | null): OwnReview {
  const partner = first(row.review_partner);
  return {
    id: row.id,
    status: row.status,
    stars: row.rating,
    comment: row.comment,
    photoUrl,
    dishes: (row.review_dishes ?? []).map((entry) => ({ name: dishName(entry), stars: entry.stars, comment: entry.comment })),
    partner: partner ? { stars: partner.stars, comment: partner.comment } : null,
    createdAt: row.created_at,
    vendorReply: row.vendor_reply,
  };
}

export type VendorReview =
  | { id: string; hidden: true; createdAt: string }
  | (PublicReview & { hidden: false; reported: boolean });

export function toVendorReview(row: RawReviewRow, photoUrl: string | null): VendorReview {
  if (row.status === "hidden") return { id: row.id, hidden: true, createdAt: row.created_at };
  return { ...toPublicReview(row, photoUrl), hidden: false, reported: row.reported_at !== null };
}

export type AdminReview = {
  id: string;
  storeId: string;
  storeName: string;
  customerName: string;
  status: "visible" | "hidden";
  stars: number;
  comment: string | null;
  photoUrl: string | null;
  dishes: { name: string; stars: number; comment: string | null }[];
  partner: { stars: number; comment: string | null } | null;
  createdAt: string;
  vendorReply: string | null;
  reportedAt: string | null;
  reportReason: string | null;
  reportedBy: string | null;
  hiddenReason: string | null;
  hiddenAt: string | null;
};

export function toAdminReview(row: RawReviewRow, photoUrl: string | null): AdminReview {
  const partner = first(row.review_partner);
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: first(row.stores)?.name ?? "Store",
    customerName: first(row.customer)?.full_name?.trim() || "Customer",
    status: row.status,
    stars: row.rating,
    comment: row.comment,
    photoUrl,
    dishes: (row.review_dishes ?? []).map((entry) => ({ name: dishName(entry), stars: entry.stars, comment: entry.comment })),
    partner: partner ? { stars: partner.stars, comment: partner.comment } : null,
    createdAt: row.created_at,
    vendorReply: row.vendor_reply,
    reportedAt: row.reported_at,
    reportReason: row.report_reason,
    reportedBy: row.reported_by,
    hiddenReason: row.hidden_reason,
    hiddenAt: row.hidden_at,
  };
}

export type PartnerReviewRow = { stars: number; comment: string | null; createdAt: string };

// What GET /api/delivery/rating returns to the signed-in partner (own aggregate and recent comments, no customer identity).
export type PartnerRating = { average: number | null; count: number; recent: PartnerReviewRow[] };

export function toPartnerReviewRow(row: {
  created_at: string;
  review_partner: OneOrMany<{ stars: number; comment: string | null }>;
}): PartnerReviewRow | null {
  const partner = first(row.review_partner);
  if (!partner) return null;
  return { stars: partner.stars, comment: partner.comment, createdAt: row.created_at.slice(0, 10) };
}

// What the order screens need from GET /api/customer/orders/[id]/review.
export type OrderReviewState = {
  eligible: boolean;
  dishes: { productId: string; name: string }[];
  hasPartner: boolean;
  review: OwnReview | null;
  partnerScore: PartnerScore | null;
};
