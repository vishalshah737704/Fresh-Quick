import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  capResult,
  formatRupees,
  productView,
  sanitizeText,
  storeView,
  type DishView,
  type FindStoresInput,
  type GetItemOptionsInput,
  type GetStoreMenuInput,
  type Point,
  type ProductRow,
  type ProductView,
  type StoreRow,
  type StoreView,
} from "./catalog";

const STORE_COLUMNS =
  "id, name, category_type, cuisine_tags, is_open, is_suspended, rating, avg_prep_minutes, delivery_fee_paise, promo_text, lat, lng";
const PRODUCT_COLUMNS = "id, store_id, name, description, price, category, is_available, product_attributes";

export type CatalogHit = { kind: "store" | "product"; ref_id: string };

export async function loadCuisineLabels(): Promise<Record<string, string>> {
  const { data, error } = await supabaseServer.from("cuisine_taxonomy").select("slug, label");
  if (error) throw new Error(`Reading cuisine_taxonomy failed: ${error.message}`);
  return Object.fromEntries((data ?? []).map((t) => [t.slug as string, t.label as string]));
}

// Re-reads live rows for catalog hits. Suspended stores are dropped; closed stores and
// unavailable dishes are kept and flagged by the views.
export async function hydrateHits(
  hits: CatalogHit[],
  from: Point | null,
  labels: Record<string, string>
): Promise<{ stores: StoreView[]; dishes: DishView[] }> {
  const storeIds = hits.filter((h) => h.kind === "store").map((h) => h.ref_id);
  const productIds = hits.filter((h) => h.kind === "product").map((h) => h.ref_id);

  const products: ProductRow[] = [];
  if (productIds.length > 0) {
    const { data, error } = await supabaseServer.from("products").select(PRODUCT_COLUMNS).in("id", productIds);
    if (error) throw new Error(`Reading products failed: ${error.message}`);
    products.push(...((data ?? []) as ProductRow[]));
  }
  const wantedStoreIds = [...new Set([...storeIds, ...products.map((p) => p.store_id)])];
  const storeRows: StoreRow[] = [];
  if (wantedStoreIds.length > 0) {
    const { data, error } = await supabaseServer.from("stores").select(STORE_COLUMNS).in("id", wantedStoreIds);
    if (error) throw new Error(`Reading stores failed: ${error.message}`);
    storeRows.push(...((data ?? []) as StoreRow[]));
  }
  const active = new Map(storeRows.filter((s) => !s.is_suspended).map((s) => [s.id, s]));

  const stores = storeIds
    .map((id) => active.get(id))
    .filter((s): s is StoreRow => s !== undefined)
    .map((s) => storeView(s, labels, from));
  const dishes: DishView[] = [];
  for (const id of productIds) {
    const p = products.find((x) => x.id === id);
    const s = p ? active.get(p.store_id) : undefined;
    if (!p || !s) continue;
    dishes.push({ ...productView(p), store_id: s.id, store_name: sanitizeText(s.name), store_open: s.is_open === true });
  }
  return { stores, dishes };
}

// PostgREST also treats `*` in like/ilike values as a wildcard and offers no escape for it, so drop it.
const escapeLike = (v: string) => v.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);

export async function findStores(
  input: FindStoresInput,
  from: Point | null,
  labels: Record<string, string>
): Promise<{ stores: StoreView[]; truncated: boolean; note?: string }> {
  if (input.sort === "distance" && !from) {
    return {
      stores: [],
      truncated: false,
      note: "No delivery location was shared, so stores cannot be sorted by distance. Tell the user to choose a delivery location on the Home page, or ask for a different sort.",
    };
  }
  let query = supabaseServer.from("stores").select(STORE_COLUMNS).eq("is_suspended", false);
  if (input.open_now) query = query.eq("is_open", true);
  if (input.free_delivery) query = query.eq("delivery_fee_paise", 0);
  if (input.max_delivery_fee_rupees !== undefined) {
    query = query.lte("delivery_fee_paise", Math.round(input.max_delivery_fee_rupees * 100));
  }
  if (input.min_rating !== undefined) query = query.gte("rating", input.min_rating);
  if (input.name_contains) query = query.ilike("name", `%${escapeLike(input.name_contains)}%`);
  if (input.category) query = query.ilike("category_type", escapeLike(input.category));
  if (input.cuisine) {
    const wanted = input.cuisine.toLowerCase();
    const slug = Object.entries(labels).find(([s, l]) => s.toLowerCase() === wanted || l.toLowerCase() === wanted)?.[0];
    if (!slug) {
      return { stores: [], truncated: false, note: `No cuisine called "${sanitizeText(input.cuisine, 60)}" exists. Cuisines: ${Object.values(labels).join(", ")}.` };
    }
    query = query.contains("cuisine_tags", [slug]);
  }
  const { data, error } = await query.limit(500);
  if (error) throw new Error(`Reading stores failed: ${error.message}`);

  const views = ((data ?? []) as StoreRow[]).map((s) => ({ view: storeView(s, labels, from), row: s }));
  const feeOf = (r: StoreRow) => r.delivery_fee_paise ?? 0;
  views.sort((a, b) => {
    switch (input.sort) {
      case "distance":
        return (a.view.distance_km ?? Infinity) - (b.view.distance_km ?? Infinity);
      case "delivery_fee":
        return feeOf(a.row) - feeOf(b.row);
      case "prep_time":
        return (a.view.prep_minutes ?? Infinity) - (b.view.prep_minutes ?? Infinity);
      default:
        return (b.view.rating ?? -1) - (a.view.rating ?? -1);
    }
  });
  const top = views.slice(0, input.limit).map((v) => v.view);
  const capped = capResult(top);
  return { stores: capped.items, truncated: capped.truncated || views.length > input.limit };
}

export async function getStoreMenu(
  input: GetStoreMenuInput,
  labels: Record<string, string>
): Promise<{ store: StoreView; items: ProductView[]; truncated: boolean } | { error: string }> {
  const { data: storeRow, error: storeError } = await supabaseServer
    .from("stores")
    .select(STORE_COLUMNS)
    .eq("id", input.store_id)
    .maybeSingle();
  if (storeError) throw new Error(`Reading stores failed: ${storeError.message}`);
  if (!storeRow || (storeRow as StoreRow).is_suspended) return { error: "store not found" };

  let query = supabaseServer.from("products").select(PRODUCT_COLUMNS).eq("store_id", input.store_id);
  if (input.name_contains) query = query.ilike("name", `%${escapeLike(input.name_contains)}%`);
  if (input.category) query = query.ilike("category", `%${escapeLike(input.category)}%`);
  const { data, error } = await query.order("category").order("name").limit(input.limit + 1);
  if (error) throw new Error(`Reading products failed: ${error.message}`);
  const rows = (data ?? []) as ProductRow[];
  const views = rows.slice(0, input.limit).map(productView);
  const capped = capResult(views);
  return {
    store: storeView(storeRow as StoreRow, labels, null),
    items: capped.items,
    truncated: capped.truncated || rows.length > input.limit,
  };
}

export async function getItemOptions(input: GetItemOptionsInput): Promise<
  | {
      item: { id: string; name: string; price: string; available: boolean; store: string };
      option_groups: { name: string; min_select: number; max_select: number; options: { name: string; extra_price: string }[] }[];
    }
  | { error: string }
> {
  const { data: product, error } = await supabaseServer
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", input.product_id)
    .maybeSingle();
  if (error) throw new Error(`Reading products failed: ${error.message}`);
  if (!product) return { error: "dish not found" };
  const p = product as ProductRow;
  const { data: store, error: storeError } = await supabaseServer
    .from("stores")
    .select("name, is_suspended")
    .eq("id", p.store_id)
    .maybeSingle();
  if (storeError) throw new Error(`Reading stores failed: ${storeError.message}`);
  if (!store || store.is_suspended) return { error: "dish not found" };

  const { data: groups, error: groupError } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id, name, min_select, max_select, sort_order")
    .eq("product_id", p.id)
    .order("sort_order");
  if (groupError) throw new Error(`Reading option groups failed: ${groupError.message}`);
  const groupIds = (groups ?? []).map((g) => g.id as string);
  const options: { option_group_id: string; name: string; price_delta_paise: number; sort_order: number }[] = [];
  if (groupIds.length > 0) {
    const { data, error: optionError } = await supabaseServer
      .from("menu_item_options")
      .select("option_group_id, name, price_delta_paise, sort_order")
      .in("option_group_id", groupIds)
      .order("sort_order");
    if (optionError) throw new Error(`Reading options failed: ${optionError.message}`);
    options.push(...(data ?? []));
  }
  const view = productView(p);
  return {
    item: { id: view.id, name: view.name, price: view.price, available: view.available, store: sanitizeText(store.name) },
    option_groups: (groups ?? []).map((g) => ({
      name: sanitizeText(g.name),
      min_select: g.min_select as number,
      max_select: g.max_select as number,
      options: options
        .filter((o) => o.option_group_id === g.id)
        .map((o) => ({ name: sanitizeText(o.name), extra_price: formatRupees(o.price_delta_paise ?? 0) })),
    })),
  };
}
