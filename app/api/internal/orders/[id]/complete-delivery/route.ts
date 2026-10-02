import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { completeDelivery } from "@/lib/complete-delivery-server";

// Called only by n8n workflow 05's 20-second fallback when the customer never
// finished the animation. Idempotent: 200 if already delivered, 409 for any
// other non-picked_up status (cancelled etc.) -- n8n treats both as done.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await completeDelivery(id, "internal");
  return NextResponse.json(result.body, { status: result.httpStatus });
}
