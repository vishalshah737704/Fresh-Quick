import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase-server";
import { embedTexts } from "./openai-embed";
import { randomUUID } from "node:crypto";
import {
  formatRupees,
  parseFindStoresInput,
  parseGetItemOptionsInput,
  parseGetStoreMenuInput,
  parseSearchCatalogInput,
  sanitizeText,
  toPaise,
  type Point,
} from "./catalog";
import { loadProductsForCart } from "./actions-data";
import {
  buildAddItemCard,
  buildCartChangeCard,
  buildCheckoutCard,
  cartDishIds,
  checkoutAlreadyPrepared,
  buildClearCartCard,
  buildReorderCard,
  parseProposeAddInput,
  parseProposeCartChangeInput,
  parseProposeClearInput,
  parseProposeReorderInput,
  selectActionTools,
  shapeCartForModel,
  LIMITS,
} from "./actions";
import type { ActionCard, CartSnapshot } from "./action-types";
import { findStores, getItemOptions, getStoreMenu, hydrateHits, loadCuisineLabels, type CatalogHit } from "./catalog-data";

import { ordersReader } from "./orders-data";
import { parseGetMyOrderInput, parseListMyOrdersInput, selectTools } from "./orders";

export type ToolContext = {
  location: Point | null;
  customerId: string | null;
  ordersEnabled: boolean;
  actionsEnabled: boolean;
  cart: CartSnapshot | null;
  actions: ActionCard[];
};

// Anthropic tool definitions. strict: true guarantees schema-valid input; ranges are re-checked by the parsers.
export const ZIPPY_TOOLS: Anthropic.Tool[] = [
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
      "Get a dish's option groups (such as size or add-ons), how many can be chosen, each option's extra price, and each option's id (pass the chosen ids as option_ids to propose_add_to_cart). The product_id must come from an earlier tool result or the catalog block.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { product_id: { type: "string", description: "Dish id (uuid) from an earlier result" } },
      required: ["product_id"],
      additionalProperties: false,
    },
  },
];

// The tool list this caller may use: order tools only for a verified customer with orders switched on.
export function toolsFor(ctx: ToolContext): Anthropic.Tool[] {
  return selectActionTools(selectTools(ZIPPY_TOOLS, ctx), ctx);
}

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

const actionDeps = { sanitize: sanitizeText, toPaise, formatRupees, newId: () => randomUUID() };

// Proposals only append a card; nothing is changed until the customer taps Confirm in their own app.
function pushCard(ctx: ToolContext, result: { ok: true; card: ActionCard } | { ok: false; error: string }) {
  if (!result.ok) return bad(result.error);
  if (ctx.actions.length >= LIMITS.maxCardsPerReply) return bad("Too many proposals in one reply; ask the user to confirm these first");
  ctx.actions.push(result.card);
  return ok({ proposal_id: result.card.id, summary: result.card.description, status: "waiting for the customer to tap Confirm" });
}
const actionsAllowed = (ctx: ToolContext) => Boolean(ctx.customerId) && ctx.actionsEnabled;

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
      if (!embedding) throw new Error("embedTexts returned no embedding");
      const wanted = parsed.value.kind === "store" ? "store" : parsed.value.kind === "dish" ? "product" : null;
      // Dishes (~2,900) dominate stores (~80), so a kind filter needs a much wider candidate pool.
      const hits = (await matchCatalog(embedding, wanted ? 60 : 12)).filter((h) => (wanted ? h.kind === wanted : true)).slice(0, 6);
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
    case "list_my_orders": {
      if (!ctx.customerId || !ctx.ordersEnabled) return bad("Orders are only available to a signed-in customer");
      const parsed = parseListMyOrdersInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      return ok(await ordersReader.listMyOrders(ctx.customerId, parsed.value));
    }
    case "get_my_order": {
      if (!ctx.customerId || !ctx.ordersEnabled) return bad("Orders are only available to a signed-in customer");
      const parsed = parseGetMyOrderInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      const result = await ordersReader.getMyOrder(ctx.customerId, parsed.value);
      return "error" in result ? bad(result.error) : ok(result);
    }
    case "get_my_cart": {
      if (!actionsAllowed(ctx)) return bad("Cart actions are only available to a signed-in customer");
      return ok(shapeCartForModel(ctx.cart, actionDeps));
    }
    case "propose_add_to_cart": {
      if (!actionsAllowed(ctx)) return bad("Cart actions are only available to a signed-in customer");
      const parsed = parseProposeAddInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      const products = await loadProductsForCart([parsed.value.product_id]);
      const product = products.get(parsed.value.product_id);
      if (!product) return bad("dish not found");
      return pushCard(ctx, buildAddItemCard({ product, quantity: parsed.value.quantity, optionIds: parsed.value.option_ids, note: parsed.value.note, cart: ctx.cart }, actionDeps));
    }
    case "propose_reorder": {
      if (!actionsAllowed(ctx) || !ctx.customerId || !ctx.ordersEnabled) return bad("Cart actions are only available to a signed-in customer");
      const parsed = parseProposeReorderInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      const source = await ordersReader.getReorderSource(ctx.customerId, parsed.value);
      if ("error" in source) return bad(source.error);
      const products = await loadProductsForCart(source.lines.map((line) => line.product_id));
      return pushCard(ctx, buildReorderCard(source, products, actionDeps, ctx.cart));
    }
    case "propose_cart_change": {
      if (!actionsAllowed(ctx)) return bad("Cart actions are only available to a signed-in customer");
      const parsed = parseProposeCartChangeInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      return pushCard(ctx, buildCartChangeCard(ctx.cart, parsed.value, actionDeps));
    }
    case "propose_clear_cart": {
      if (!actionsAllowed(ctx)) return bad("Cart actions are only available to a signed-in customer");
      const parsed = parseProposeClearInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      return pushCard(ctx, buildClearCartCard(ctx.cart, actionDeps));
    }
    case "propose_go_to_checkout": {
      if (!actionsAllowed(ctx)) return bad("Cart actions are only available to a signed-in customer");
      const parsed = parseProposeClearInput(rawInput);
      if (!parsed.ok) return bad(parsed.error);
      const already = () => bad("A checkout card is already prepared in this reply");
      if (checkoutAlreadyPrepared(ctx.actions)) return already();
      const products = await loadProductsForCart(cartDishIds(ctx.cart));
      // Concurrent calls in one round all passed the check above; re-check after the await, with no await before the push.
      if (checkoutAlreadyPrepared(ctx.actions)) return already();
      return pushCard(ctx, buildCheckoutCard(ctx.cart, products, actionDeps));
    }
    default:
      return bad(`unknown tool ${name}`);
  }
}
