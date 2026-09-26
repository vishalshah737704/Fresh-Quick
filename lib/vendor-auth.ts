import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type VendorResolution =
  | { vendorId: string; storeId: string }
  | { error: string; status: number };

export async function resolveVendorStore(
  token: string | undefined
): Promise<VendorResolution> {
  if (!token) {
    return { error: "Not authenticated", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Not authenticated", status: 401 };
  }
  const vendorId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", vendorId)
    .single();
  if (profileError || !profile || profile.role !== "vendor") {
    return { error: "Not a vendor account", status: 403 };
  }

  const { data: store, error: storeError } = await supabaseServer
    .from("stores")
    .select("id")
    .eq("owner_id", vendorId)
    .single();
  if (storeError || !store) {
    return { error: "No store found for this vendor", status: 404 };
  }

  return { vendorId, storeId: store.id };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
