import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { ingestKnowledge } from "@/lib/zippy/ingest";

// Called by n8n workflow 06 (on demand + nightly) to sync knowledge/*.md into pgvector.
export async function POST(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await ingestKnowledge());
  } catch (error) {
    console.error("zippy ingest failed", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
