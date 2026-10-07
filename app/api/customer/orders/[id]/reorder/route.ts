import { NextRequest, NextResponse } from "next/server";
import { resolveCustomer } from "@/lib/customer-auth";
import { buildReorderLines, uuidsOnly } from "@/lib/zippy/actions";
import { loadProductsForCart } from "@/lib/zippy/actions-data";
import { ordersReader } from "@/lib/zippy/orders-data";
import { formatRupees, sanitizeText, toPaise } from "@/lib/zippy/catalog";
import type { ReorderResponse } from "@/lib/favorites-model";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The reader filters on the verified customer id, so another customer's order id is simply "not found".
  let source: Awaited<ReturnType<typeof ordersReader.getReorderSource>>;
  let built: ReturnType<typeof buildReorderLines>;
  try {
    source = await ordersReader.getReorderSource(who.userId, { order_id: id.toLowerCase() });
    if ("error" in source) return NextResponse.json({ error: "not found" }, { status: 404 });
    const products = await loadProductsForCart(source.lines.map((line) => line.product_id));
    built = buildReorderLines(source, products, { sanitize: sanitizeText, toPaise, formatRupees, newId: () => "reorder" });
  } catch (err) {
    console.error("reorder failed", err);
    return NextResponse.json({ error: "Could not reorder right now" }, { status: 500 });
  }
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: built.error === "not found" ? 404 : 409 });
  }
  const body: ReorderResponse = {
    storeId: source.store_id,
    storeName: built.storeName,
    lines: built.items,
    skipped: built.skipped,
  };
  return NextResponse.json(body);
}
