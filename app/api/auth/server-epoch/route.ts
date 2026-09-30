import { NextResponse } from "next/server";
import { SERVER_START_EPOCH } from "@/lib/server-epoch";

// Lets the client detect a server restart (see lib/server-epoch.ts and
// components/SessionEpochGuard.tsx). Must never be statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ epoch: SERVER_START_EPOCH });
}
