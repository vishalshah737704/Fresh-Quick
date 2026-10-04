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
  deps: { sanitize: sanitizeText, toPaise, formatRupees, statusLabel: STATUS_LABEL },
});
