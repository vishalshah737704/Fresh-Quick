import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { runTool } from "@/lib/zippy/tools";
import type { Point } from "@/lib/zippy/catalog";

// Developer/verification endpoint: run one Zippy tool and see exactly what the model would see.
export async function POST(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  let body: { name?: unknown; input?: unknown; location?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.name !== "string") return NextResponse.json({ error: "name is required" }, { status: 400 });
  let location: Point | null = null;
  const loc = body.location as { lat?: unknown; lng?: unknown } | null | undefined;
  if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") location = { lat: loc.lat, lng: loc.lng };
  try {
    return NextResponse.json(await runTool(body.name, body.input ?? {}, { location, customerId: null, ordersEnabled: false, actionsEnabled: false, cart: null, actions: [] }));
  } catch (error) {
    console.error("zippy tool failed", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
