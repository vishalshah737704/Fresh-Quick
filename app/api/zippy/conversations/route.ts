import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "@/lib/zippy/caller";
import { listConversations } from "@/lib/zippy/store";

export async function GET(request: NextRequest) {
  const resolved = await resolveCaller(request);
  if ("error" in resolved || resolved.caller.userId === null) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    return NextResponse.json({ conversations: await listConversations(resolved.caller.userId) });
  } catch (error) {
    console.error("zippy: list conversations failed", error);
    return NextResponse.json({ error: "Could not load history" }, { status: 500 });
  }
}
