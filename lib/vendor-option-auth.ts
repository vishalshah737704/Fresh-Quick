import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export async function assertOwnsGroup(restaurantId: string, groupId: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id, menu_items!inner(restaurant_id)")
    .eq("id", groupId)
    .eq("menu_items.restaurant_id", restaurantId)
    .single();
  return !error && !!data;
}

export async function assertOwnsOption(
  restaurantId: string,
  optionId: string
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("menu_item_options")
    .select("id, option_group_id")
    .eq("id", optionId)
    .single();
  if (error || !data) return null;
  const owns = await assertOwnsGroup(restaurantId, data.option_group_id);
  return owns ? data.option_group_id : null;
}
