import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { ORDER_DETAIL_SELECT, ORDER_LIST_SELECT } from "@/lib/order-detail";
import { STATUS_LABEL } from "@/lib/order-status";
import { formatRupees, sanitizeText, toPaise } from "./catalog";
import { createOrdersReader, type OrdersDb } from "./orders";

export const ordersReader = createOrdersReader({
  db: supabaseServer as unknown as OrdersDb,
  listSelect: ORDER_LIST_SELECT,
  detailSelect: ORDER_DETAIL_SELECT,
  reorderSelect: "id, store_id, order_items(product_id, quantity, special_instructions, order_item_options(menu_item_option_id))",
  deps: { sanitize: sanitizeText, toPaise, formatRupees, statusLabel: STATUS_LABEL },
});
