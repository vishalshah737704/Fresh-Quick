import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { embedTexts } from "./openai-embed";
import {
  parseFindStoresInput,
  parseGetItemOptionsInput,
  parseGetStoreMenuInput,
  parseSearchCatalogInput,
  type Point,
} from "./catalog";
import { findStores, getItemOptions, getStoreMenu, hydrateHits, loadCuisineLabels, type CatalogHit } from "./catalog-data";

export type ToolContext = { location: Point | null };

// Anthropic tool definitions. strict: true guarantees schema-valid input; ranges are re-checked by the parsers.
export const ZIPPY_TOOLS = [
  {
    name: "search_catalog",
    description:
      "Semantic search over stores and dishes. Use for fuzzy discovery such as 'something spicy and vegetarian' or 'a place for biryani'. Returns live open/closed status, prices and ids. For exact filters (open now, free delivery, nearest), use find_stores instead.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the user is looking for, in plain words" },
        kind: { type: "string", enum: ["store", "dish", "any"], description: "Restrict to stores or dishes; default any" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "find_stores",
    description:
      "Find stores with exact filters, sorted. Use for open now, free delivery, a maximum delivery fee, a minimum rating, a cuisine or category, a store name, or nearest first (sort distance, needs the user's delivery location). Returns live data with store ids.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name_contains: { type: "string", description: "Part of the store name" },
        category: { type: "string", description: "Store category such as restaurant, grocery, pet, flowers" },
        cuisine: { type: "string", description: "Cuisine name such as Indian or Chinese" },
        open_now: { type: "boolean", description: "Only stores that are open right now" },
        free_delivery: { type: "boolean", description: "Only stores with zero delivery fee" },
        max_delivery_fee_rupees: { type: "number", description: "Highest delivery fee in rupees" },
        min_rating: { type: "number", description: "Lowest rating from 0 to 5" },
        sort: { type: "string", enum: ["distance", "rating", "delivery_fee", "prep_time"], description: "Sort order; default rating" },
        limit: { type: "number", description: "How many stores, 1 to 8; default 5" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_store_menu",
    description:
      "List a store's dishes with live prices and availability. The store_id must come from an earlier tool result or the catalog block. Optionally filter by dish name or category.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        store_id: { type: "string", description: "Store id (uuid) from an earlier result" },
        name_contains: { type: "string", description: "Part of a dish name" },
        category: { type: "string", description: "Menu category" },
        limit: { type: "number", description: "How many dishes, 1 to 25; default 15" },
      },
      required: ["store_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_item_options",
    description:
      "Get a dish's option groups (such as size or add-ons), how many can be chosen, and each option's extra price. The product_id must come from an earlier tool result or the catalog block.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { product_id: { type: "string", description: "Dish id (uuid) from an earlier result" } },
      required: ["product_id"],
      additionalProperties: false,
    },
  },
] as const;

export const MIN_CATALOG_SIMILARITY = 0.3;

export async function matchCatalog(
  embedding: number[],
  count: number
): Promise<(CatalogHit & { content: string; similarity: number })[]> {
  const { data, error } = await supabaseServer.rpc("match_zippy_catalog", {
    query_embedding: embedding,
    match_count: count,
  });
  if (error) throw new Error(`match_zippy_catalog failed: ${error.message}`);
  return ((data ?? []) as { kind: "store" | "product"; ref_id: string; content: string; similarity: number }[]).filter(
    (h) => h.similarity >= MIN_CATALOG_SIMILARITY
  );
}

const ok = (value: unknown) => ({ content: JSON.stringify(value), isError: false });
const bad = (message: string) => ({ content: JSON.stringify({ error: message }), isError: true });

export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext
): Promise<{ content: string; isError: boolean }> {
  switch (name) {
    case "search_catalog": {
      const parsed = parseSearchCatalogInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      const [embedding] = await embedTexts([parsed.value.query]);
      const wanted = parsed.value.kind === "store" ? "store" : parsed.value.kind === "dish" ? "product" : null;
      const hits = (await matchCatalog(embedding, 12)).filter((h) => (wanted ? h.kind === wanted : true)).slice(0, 6);
      const labels = await loadCuisineLabels();
      const { stores, dishes } = await hydrateHits(hits, ctx.location, labels);
      return ok({ stores, dishes });
    }
    case "find_stores": {
      const parsed = parseFindStoresInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      return ok(await findStores(parsed.value, ctx.location, await loadCuisineLabels()));
    }
    case "get_store_menu": {
      const parsed = parseGetStoreMenuInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      const result = await getStoreMenu(parsed.value, await loadCuisineLabels());
      return "error" in result ? bad(result.error) : ok(result);
    }
    case "get_item_options": {
      const parsed = parseGetItemOptionsInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      const result = await getItemOptions(parsed.value);
      return "error" in result ? bad(result.error) : ok(result);
    }
    default:
      return bad(`unknown tool ${name}`);
  }
}
