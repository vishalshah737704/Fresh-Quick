import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { syncCatalog } from "@/lib/zippy/catalog-sync";

// Called by n8n workflow 07 (on demand + nightly) to sync stores and dishes into the Zippy catalog index.
export async function POST(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await syncCatalog());
  } catch (error) {
    console.error("zippy catalog sync failed", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
