import { createHash } from "node:crypto";

export type Point = { lat: number; lng: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vendor-written text is untrusted: strip markup and control characters, collapse whitespace, cap length.
export function sanitizeText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

// Money rule: integer paise only.
export function toPaise(value: number | string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function formatRupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const rest = abs % 100;
  return rest === 0 ? `${sign}₹${rupees}` : `${sign}₹${rupees}.${String(rest).padStart(2, "0")}`;
}

export function haversineKm(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type StoreRow = {
  id: string;
  name: string;
  category_type: string | null;
  cuisine_tags: string[] | null;
  is_open: boolean;
  is_suspended: boolean;
  rating: number | string | null;
  avg_prep_minutes: number | null;
  delivery_fee_paise: number | null;
  promo_text: string | null;
  lat: number | string | null;
  lng: number | string | null;
};

export type ProductRow = {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  is_available: boolean;
  product_attributes: Record<string, unknown> | null;
};

export type StoreView = {
  id: string;
  name: string;
  category: string;
  cuisines: string[];
  open: boolean;
  delivery_fee: string;
  free_delivery: boolean;
  rating: number | null;
  prep_minutes: number | null;
  promo: string | null;
  distance_km?: number;
};

export type ProductView = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  price_paise: number;
  available: boolean;
  veg: boolean | null;
};

export type DishView = ProductView & { store_id: string; store_name: string; store_open: boolean };

const cuisineLabels = (tags: string[] | null, labels: Record<string, string>): string[] =>
  (tags ?? []).map((t) => sanitizeText(labels[t] ?? t, 60)).filter((t) => t !== "");

export function storeView(row: StoreRow, labels: Record<string, string>, from?: Point | null): StoreView {
  const fee = row.delivery_fee_paise ?? 0;
  const view: StoreView = {
    id: row.id,
    name: sanitizeText(row.name),
    category: sanitizeText(row.category_type, 60),
    cuisines: cuisineLabels(row.cuisine_tags, labels),
    open: row.is_open === true,
    delivery_fee: formatRupees(fee),
    free_delivery: fee === 0,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    prep_minutes: row.avg_prep_minutes ?? null,
    promo: row.promo_text ? sanitizeText(row.promo_text) || null : null,
  };
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (from && row.lat !== null && row.lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
    view.distance_km = Math.round(haversineKm(from, { lat, lng }) * 10) / 10;
  }
  return view;
}

export function productView(row: ProductRow): ProductView {
  const paise = toPaise(row.price);
  const veg = row.product_attributes && typeof row.product_attributes.is_veg === "boolean" ? row.product_attributes.is_veg : null;
  return {
    id: row.id,
    name: sanitizeText(row.name),
    description: sanitizeText(row.description, 160),
    category: sanitizeText(row.category, 60),
    price: formatRupees(paise),
    price_paise: paise,
    available: row.is_available === true,
    veg,
  };
}

// Embedded text: names, descriptions, categories, cuisines. NEVER prices, fees or open status.
export function buildStoreChunkText(row: StoreRow, labels: Record<string, string>): string {
  const parts = [`Store: ${sanitizeText(row.name)}.`];
  if (row.category_type) parts.push(`Category: ${sanitizeText(row.category_type, 60)}.`);
  const cuisines = cuisineLabels(row.cuisine_tags, labels);
  if (cuisines.length > 0) parts.push(`Cuisines: ${cuisines.join(", ")}.`);
  if (row.promo_text) parts.push(`${sanitizeText(row.promo_text)}.`);
  return parts.join(" ");
}

export function buildProductChunkText(row: ProductRow, storeName: string, storeCuisines: string[]): string {
  const parts = [`Dish: ${sanitizeText(row.name)}.`];
  const description = sanitizeText(row.description, 160);
  if (description) parts.push(`${description}.`);
  if (row.category) parts.push(`Category: ${sanitizeText(row.category, 60)}.`);
  if (row.product_attributes && typeof row.product_attributes.is_veg === "boolean") {
    parts.push(row.product_attributes.is_veg ? "Vegetarian." : "Non-vegetarian.");
  }
  const cuisines = storeCuisines.length > 0 ? ` (${storeCuisines.join(", ")})` : "";
  parts.push(`From ${sanitizeText(storeName)}${cuisines}.`);
  return parts.join(" ");
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function diffCatalog(
  existing: Map<string, string>,
  desired: { key: string; hash: string }[]
): { changedKeys: string[]; staleKeys: string[] } {
  const changedKeys = desired.filter((d) => existing.get(d.key) !== d.hash).map((d) => d.key);
  const keep = new Set(desired.map((d) => d.key));
  const staleKeys = [...existing.keys()].filter((k) => !keep.has(k));
  return { changedKeys, staleKeys };
}

export function capResult<T>(items: T[], maxBytes = 6000): { items: T[]; truncated: boolean } {
  const kept: T[] = [];
  let size = 2;
  for (const item of items) {
    const itemSize = JSON.stringify(item).length + 1;
    if (size + itemSize > maxBytes) return { items: kept, truncated: true };
    kept.push(item);
    size += itemSize;
  }
  return { items: kept, truncated: false };
}

export function formatCatalogBlock(stores: StoreView[], dishes: DishView[], asOf: string): string {
  if (stores.length === 0 && dishes.length === 0) return "";
  const lines: string[] = [`Live data as of ${asOf}. Ids can be passed to tools.`];
  for (const s of stores) {
    const bits = [
      s.open ? "open now" : "closed right now",
      `delivery ${s.delivery_fee}${s.free_delivery ? " (free)" : ""}`,
    ];
    if (s.rating !== null) bits.push(`rating ${s.rating}`);
    if (s.prep_minutes !== null) bits.push(`about ${s.prep_minutes} min`);
    if (s.distance_km !== undefined) bits.push(`${s.distance_km} km away`);
    if (s.promo) bits.push(`promo: ${s.promo}`);
    lines.push(`Store: ${s.name} [id ${s.id}] - ${bits.join(", ")}`);
  }
  for (const d of dishes) {
    const bits = [d.price, d.available ? "available" : "unavailable"];
    if (!d.store_open) bits.push("store closed right now");
    lines.push(`Dish: ${d.name} at ${d.store_name} [id ${d.id}, store id ${d.store_id}] - ${bits.join(", ")}`);
  }
  return lines.join("\n");
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const asObject = (raw: unknown): Record<string, unknown> | null =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

function optString(o: Record<string, unknown>, key: string, max: number): Parsed<string | undefined> {
  const v = o[key];
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (typeof v !== "string") return { ok: false, error: `${key} must be text` };
  const t = v.trim();
  if (t.length > max) return { ok: false, error: `${key} is too long` };
  return { ok: true, value: t === "" ? undefined : t };
}

function optBool(o: Record<string, unknown>, key: string): Parsed<boolean | undefined> {
  const v = o[key];
  if (v === undefined || v === null) return { ok: true, value: undefined };
  return typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: `${key} must be true or false` };
}

function optNumber(o: Record<string, unknown>, key: string, min: number, max: number): Parsed<number | undefined> {
  const v = o[key];
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    return { ok: false, error: `${key} must be a number from ${min} to ${max}` };
  }
  return { ok: true, value: v };
}

function limitOf(o: Record<string, unknown>, fallback: number, max: number): Parsed<number> {
  const v = o.limit;
  if (v === undefined || v === null) return { ok: true, value: fallback };
  if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: "limit must be a number" };
  return { ok: true, value: Math.min(max, Math.max(1, Math.trunc(v))) };
}

export type SearchCatalogInput = { query: string; kind: "store" | "dish" | "any" };

export function parseSearchCatalogInput(raw: unknown): Parsed<SearchCatalogInput> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  if (typeof o.query !== "string" || o.query.trim() === "") return { ok: false, error: "query is required" };
  const query = o.query.trim();
  if (query.length > 200) return { ok: false, error: "query is too long" };
  const kind = o.kind === undefined || o.kind === null ? "any" : o.kind;
  if (kind !== "store" && kind !== "dish" && kind !== "any") return { ok: false, error: "kind must be store, dish or any" };
  return { ok: true, value: { query, kind } };
}

export type FindStoresInput = {
  name_contains?: string;
  category?: string;
  cuisine?: string;
  open_now?: boolean;
  free_delivery?: boolean;
  max_delivery_fee_rupees?: number;
  min_rating?: number;
  sort: "distance" | "rating" | "delivery_fee" | "prep_time";
  limit: number;
};

export function parseFindStoresInput(raw: unknown): Parsed<FindStoresInput> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  const name = optString(o, "name_contains", 100);
  const category = optString(o, "category", 60);
  const cuisine = optString(o, "cuisine", 60);
  const open = optBool(o, "open_now");
  const free = optBool(o, "free_delivery");
  const fee = optNumber(o, "max_delivery_fee_rupees", 0, 100000);
  const rating = optNumber(o, "min_rating", 0, 5);
  const limit = limitOf(o, 5, 8);
  for (const p of [name, category, cuisine, open, free, fee, rating, limit]) if (!p.ok) return p;
  const sort = o.sort === undefined || o.sort === null ? "rating" : o.sort;
  if (sort !== "distance" && sort !== "rating" && sort !== "delivery_fee" && sort !== "prep_time") {
    return { ok: false, error: "sort must be distance, rating, delivery_fee or prep_time" };
  }
  return {
    ok: true,
    value: {
      name_contains: (name as { value?: string }).value,
      category: (category as { value?: string }).value,
      cuisine: (cuisine as { value?: string }).value,
      open_now: (open as { value?: boolean }).value,
      free_delivery: (free as { value?: boolean }).value,
      max_delivery_fee_rupees: (fee as { value?: number }).value,
      min_rating: (rating as { value?: number }).value,
      sort,
      limit: (limit as { value: number }).value,
    },
  };
}

export type GetStoreMenuInput = { store_id: string; name_contains?: string; category?: string; limit: number };

export function parseGetStoreMenuInput(raw: unknown): Parsed<GetStoreMenuInput> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  if (typeof o.store_id !== "string" || !UUID.test(o.store_id)) return { ok: false, error: "store_id must be a store id from an earlier result" };
  const name = optString(o, "name_contains", 100);
  const category = optString(o, "category", 60);
  const limit = limitOf(o, 15, 25);
  for (const p of [name, category, limit]) if (!p.ok) return p;
  return {
    ok: true,
    value: {
      store_id: o.store_id,
      name_contains: (name as { value?: string }).value,
      category: (category as { value?: string }).value,
      limit: (limit as { value: number }).value,
    },
  };
}

export type GetItemOptionsInput = { product_id: string };

export function parseGetItemOptionsInput(raw: unknown): Parsed<GetItemOptionsInput> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  if (typeof o.product_id !== "string" || !UUID.test(o.product_id)) return { ok: false, error: "product_id must be a dish id from an earlier result" };
  return { ok: true, value: { product_id: o.product_id } };
}
