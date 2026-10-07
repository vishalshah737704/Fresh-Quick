import "server-only";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Identity comes only from the verified session token, never from the body.
export async function resolveCustomer(
  request: NextRequest
): Promise<{ userId: string } | { error: string; status: number }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing Authorization header", status: 401 };
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) return { error: "Invalid or expired session", status: 401 };
  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) return { error: "Failed to verify account", status: 500 };
  if (!profile || profile.role !== "customer") return { error: "Customers only", status: 403 };
  return { userId: userData.user.id };
}
