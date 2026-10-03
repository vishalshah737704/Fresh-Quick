import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "@/lib/zippy/caller";
import { getConversationMessages } from "@/lib/zippy/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveCaller(request);
  if ("error" in resolved || resolved.caller.userId === null) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  try {
    const messages = await getConversationMessages(id, resolved.caller.userId);
    if (messages === null) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("zippy: load conversation failed", error);
    return NextResponse.json({ error: "Could not load conversation" }, { status: 500 });
  }
}
