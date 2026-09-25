import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type AdminResolution =
  | { adminId: string }
  | { error: string; status: number };

export async function resolveAdmin(
  token: string | undefined
): Promise<AdminResolution> {
  if (!token) {
    return { error: "Not authenticated", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Not authenticated", status: 401 };
  }
  const adminId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", adminId)
    .single();
  if (profileError || !profile || profile.role !== "admin") {
    return { error: "Not an admin account", status: 403 };
  }

  return { adminId };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
