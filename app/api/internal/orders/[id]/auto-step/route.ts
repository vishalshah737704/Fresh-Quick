import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { runAutoStep } from "@/lib/auto-order";
import { autoStepDeps } from "@/lib/auto-order-server";

// Called only by n8n workflow 09, 3 s after a status event. Always 200 for skips so n8n treats them as done.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const expectedStatus = typeof body?.expectedStatus === "string" ? body.expectedStatus : "";
  if (!expectedStatus) {
    return NextResponse.json({ error: "expectedStatus is required" }, { status: 400 });
  }
  return NextResponse.json(await runAutoStep(autoStepDeps, id, expectedStatus));
}
