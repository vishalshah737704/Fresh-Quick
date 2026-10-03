import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
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
  const { data, error } = await supabaseServer.auth.getUser(bearer.token);
  if (error || !data.user) return { error: "Not authenticated", status: 401 };
  const { data: profile } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .single();
  const role = profile?.role as ZippyRole | undefined;
  if (!role || !ROLES.includes(role)) return { error: "Not authenticated", status: 401 };
  return { caller: { userId: data.user.id, role } };
}
