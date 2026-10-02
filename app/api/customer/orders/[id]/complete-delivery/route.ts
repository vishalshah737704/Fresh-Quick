import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { completeDelivery } from "@/lib/complete-delivery-server";

// Called by the customer's app when its 15 s delivery animation ends. Identity
// comes from the verified session token, never from the body.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const result = await completeDelivery(id, "customer", userData.user.id);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
