import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import type { ProductForCart } from "./actions";

type ProductRow = { id: string; name: string; price: number | string; image_url: string | null; is_available: boolean; store_id: string };
type StoreRow = { id: string; name: string; is_open: boolean; is_suspended: boolean };
type GroupRow = { id: string; product_id: string; name: string; min_select: number; max_select: number; sort_order: number };
type OptionRow = { id: string; option_group_id: string; name: string; price_delta_paise: number; sort_order: number };

// Live read of dishes with their store and option groups. Missing ids are simply absent from the map.
export async function loadProductsForCart(ids: string[]): Promise<Map<string, ProductForCart>> {
  const result = new Map<string, ProductForCart>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return result;

  const { data: products, error: productError } = await supabaseServer
    .from("products")
    .select("id, name, price, image_url, is_available, store_id")
    .in("id", unique);
  if (productError) throw new Error(`Reading products failed: ${productError.message}`);
  const productRows = (products ?? []) as ProductRow[];
  if (productRows.length === 0) return result;

  const storeIds = [...new Set(productRows.map((p) => p.store_id))];
  const { data: stores, error: storeError } = await supabaseServer
    .from("stores")
    .select("id, name, is_open, is_suspended")
    .in("id", storeIds);
  if (storeError) throw new Error(`Reading stores failed: ${storeError.message}`);
  const storeById = new Map(((stores ?? []) as StoreRow[]).map((s) => [s.id, s]));

  const { data: groups, error: groupError } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id, product_id, name, min_select, max_select, sort_order")
    .in("product_id", productRows.map((p) => p.id))
    .order("sort_order");
  if (groupError) throw new Error(`Reading option groups failed: ${groupError.message}`);
  const groupRows = (groups ?? []) as GroupRow[];

  let optionRows: OptionRow[] = [];
  if (groupRows.length > 0) {
    const { data: options, error: optionError } = await supabaseServer
      .from("menu_item_options")
      .select("id, option_group_id, name, price_delta_paise, sort_order")
      .in("option_group_id", groupRows.map((g) => g.id))
      .order("sort_order");
    if (optionError) throw new Error(`Reading options failed: ${optionError.message}`);
    optionRows = (options ?? []) as OptionRow[];
  }

  for (const row of productRows) {
    const store = storeById.get(row.store_id);
    if (!store) continue;
    result.set(row.id, {
      id: row.id,
      name: row.name,
      price: row.price,
      imageUrl: row.image_url,
      isAvailable: row.is_available,
      storeId: store.id,
      storeName: store.name,
      storeOpen: store.is_open,
      storeSuspended: store.is_suspended,
      groups: groupRows
        .filter((g) => g.product_id === row.id)
        .map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.min_select,
          maxSelect: g.max_select,
          options: optionRows.filter((o) => o.option_group_id === g.id).map((o) => ({ id: o.id, name: o.name, priceDeltaPaise: o.price_delta_paise })),
        })),
    });
  }
  return result;
}
