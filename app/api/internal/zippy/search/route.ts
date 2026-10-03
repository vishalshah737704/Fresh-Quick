import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { retrieveChunks } from "@/lib/zippy/retrieve";
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
    const matches = await retrieveChunks(body.question.trim(), role as ZippyRole | null);
    return NextResponse.json({ matches });
  } catch (error) {
    console.error("zippy search failed", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
