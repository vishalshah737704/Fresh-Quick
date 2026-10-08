import { NextRequest } from "next/server";
import { moderate } from "@/lib/reviews-admin";

export const POST = (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => moderate(request, ctx, "hide");
