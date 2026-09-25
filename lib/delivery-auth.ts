import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type DeliveryResolution =
  | { partnerId: string }
  | { error: string; status: number };

export async function resolveDeliveryPartner(
  token: string | undefined
): Promise<DeliveryResolution> {
  if (!token) {
    return { error: "Not authenticated", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Not authenticated", status: 401 };
  }
  const partnerId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", partnerId)
    .single();
  if (profileError || !profile || profile.role !== "delivery") {
    return { error: "Not a delivery partner account", status: 403 };
  }

  const { data: partnerRow, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("user_id")
    .eq("user_id", partnerId)
    .single();
  if (partnerError || !partnerRow) {
    return { error: "No delivery partner profile found", status: 404 };
  }

  return { partnerId };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
