import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { embedQuestion, retrieveChunks } from "@/lib/zippy/retrieve";
import { matchCatalog } from "@/lib/zippy/tools";
import type { ZippyRole } from "@/lib/zippy/audience";

const ROLES = ["customer", "vendor", "delivery", "admin"];

// Developer/eval endpoint: shows what retrieval returns for a question and role.
export async function POST(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  let body: { question?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.question !== "string" || body.question.trim() === "") {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  const role = body.role === null || body.role === undefined ? null : String(body.role);
  if (role !== null && !ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  try {
    const embedding = await embedQuestion(body.question.trim());
    const matches = await retrieveChunks(embedding, role as ZippyRole | null);
    const catalog = await matchCatalog(embedding, 8);
    return NextResponse.json({ matches, catalog });
  } catch (error) {
    console.error("zippy search failed", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
