import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { embedTexts } from "./openai-embed";
import {
  buildProductChunkText,
  buildStoreChunkText,
  diffCatalog,
  hashText,
  type ProductRow,
  type StoreRow,
} from "./catalog";

const PAGE = 1000;
const UPSERT_BATCH = 200;
const DELETE_BATCH = 100;

// PostgREST caps a response at 1000 rows by default, so read in pages.
async function fetchAll<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(`Reading ${what} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function syncCatalog(): Promise<{ total: number; embedded: number; unchanged: number; deleted: number }> {
  const taxonomy = await fetchAll<{ slug: string; label: string }>(
    (from, to) => supabaseServer.from("cuisine_taxonomy").select("slug, label").order("slug").range(from, to),
    "cuisine_taxonomy"
  );
  const labels: Record<string, string> = Object.fromEntries(taxonomy.map((t) => [t.slug, t.label]));

  const stores = await fetchAll<StoreRow>(
    (from, to) =>
      supabaseServer
        .from("stores")
        .select("id, name, category_type, cuisine_tags, is_open, is_suspended, rating, avg_prep_minutes, delivery_fee_paise, promo_text, lat, lng")
        .eq("is_suspended", false)
        .order("id")
        .range(from, to),
    "stores"
  );
  // Guard: an empty or failed source must never wipe the index.
  if (stores.length === 0) throw new Error("No active stores found; refusing to sync the catalog");
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const products = (
    await fetchAll<ProductRow>(
      (from, to) =>
        supabaseServer
          .from("products")
          .select("id, store_id, name, description, price, category, is_available, product_attributes")
          .order("id")
          .range(from, to),
      "products"
    )
  ).filter((p) => storeById.has(p.store_id));

  const desired: { key: string; kind: "store" | "product"; refId: string; text: string; hash: string }[] = [];
  for (const s of stores) {
    const text = buildStoreChunkText(s, labels);
    desired.push({ key: `store:${s.id}`, kind: "store", refId: s.id, text, hash: hashText(text) });
  }
  for (const p of products) {
    const store = storeById.get(p.store_id)!;
    const cuisines = (store.cuisine_tags ?? []).map((t) => labels[t] ?? t);
    const text = buildProductChunkText(p, store.name, cuisines);
    desired.push({ key: `product:${p.id}`, kind: "product", refId: p.id, text, hash: hashText(text) });
  }

  const existingRows = await fetchAll<{ kind: string; ref_id: string; content_hash: string }>(
    (from, to) =>
      supabaseServer.from("zippy_catalog_chunks").select("kind, ref_id, content_hash").order("ref_id").range(from, to),
    "zippy_catalog_chunks"
  );
  const existing = new Map(existingRows.map((r) => [`${r.kind}:${r.ref_id}`, r.content_hash]));
  const { changedKeys, staleKeys } = diffCatalog(existing, desired.map((d) => ({ key: d.key, hash: d.hash })));

  const changedSet = new Set(changedKeys);
  const changed = desired.filter((d) => changedSet.has(d.key));
  for (let i = 0; i < changed.length; i += UPSERT_BATCH) {
    const batch = changed.slice(i, i + UPSERT_BATCH);
    const vectors = await embedTexts(batch.map((b) => b.text));
    const rows = batch.map((b, j) => ({
      kind: b.kind,
      ref_id: b.refId,
      content: b.text,
      content_hash: b.hash,
      embedding: JSON.stringify(vectors[j]),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseServer.from("zippy_catalog_chunks").upsert(rows, { onConflict: "kind,ref_id" });
    if (error) throw new Error(`Upsert into zippy_catalog_chunks failed: ${error.message}`);
  }

  for (const kind of ["store", "product"] as const) {
    const ids = staleKeys.filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1));
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      const { error } = await supabaseServer
        .from("zippy_catalog_chunks")
        .delete()
        .eq("kind", kind)
        .in("ref_id", ids.slice(i, i + DELETE_BATCH));
      if (error) throw new Error(`Deleting stale catalog rows failed: ${error.message}`);
    }
  }

  return {
    total: desired.length,
    embedded: changed.length,
    unchanged: desired.length - changed.length,
    deleted: staleKeys.length,
  };
}
