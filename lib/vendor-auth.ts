import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type VendorResolution =
  | { vendorId: string; restaurantId: string }
  | { error: string; status: number };

export async function resolveVendorRestaurant(
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

  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id")
    .eq("owner_id", vendorId)
    .single();
  if (restaurantError || !restaurant) {
    return { error: "No restaurant found for this vendor", status: 404 };
  }

  return { vendorId, restaurantId: restaurant.id };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
