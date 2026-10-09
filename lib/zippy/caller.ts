import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { guardProfile } from "@/lib/registration-guard";
import type { ZippyRole } from "./audience";
import { parseBearer } from "./validate";

export type Caller = { userId: string; role: ZippyRole } | { userId: null; role: null };

const ROLES: ZippyRole[] = ["customer", "vendor", "delivery", "admin"];

// No Authorization header = visitor. A header that is present but bad is a 401,
// never a silent downgrade, so an expired session shows "sign in again".
export async function resolveCaller(
  request: Request
): Promise<{ caller: Caller } | { error: string; status: number }> {
  const bearer = parseBearer(request.headers.get("authorization"));
  if (bearer.kind === "none") return { caller: { userId: null, role: null } };
  if (bearer.kind === "malformed") return { error: "Not authenticated", status: 401 };
  try {
    const { data, error } = await supabaseServer.auth.getUser(bearer.token);
    if (error || !data.user) return { error: "Not authenticated", status: 401 };
    const { data: profile, error: profileError } = await supabaseServer
      .from("users")
      .select("role, approval_status")
      .eq("id", data.user.id)
      .single();
    if (profileError && profileError.code !== "PGRST116") {
      console.error("zippy: profile lookup failed", profileError);
      return { error: "Could not verify your account", status: 502 };
    }
    if (profile && !guardProfile(profile).ok) {
      return { error: "Your account is not approved", status: 403 };
    }
    const role = profile?.role as ZippyRole | undefined;
    if (!role || !ROLES.includes(role)) return { error: "Not authenticated", status: 401 };
    return { caller: { userId: data.user.id, role } };
  } catch (error) {
    console.error("zippy: resolving caller failed", error);
    return { error: "Could not verify your account", status: 502 };
  }
}
