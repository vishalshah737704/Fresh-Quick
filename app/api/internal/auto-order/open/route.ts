import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { listOpenAutoOrders } from "@/lib/auto-order-server";

// Used by n8n workflow 09's sweep when the Admin ticks the box. Empty list when the setting is off.
export async function GET(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  return NextResponse.json({ orders: await listOpenAutoOrders() });
}
