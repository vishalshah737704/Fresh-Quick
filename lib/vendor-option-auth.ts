import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export async function assertOwnsGroup(storeId: string, groupId: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id, products!inner(store_id)")
    .eq("id", groupId)
    .eq("products.store_id", storeId)
    .single();
  return !error && !!data;
}

export async function assertOwnsOption(
  storeId: string,
  optionId: string
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("menu_item_options")
    .select("id, option_group_id")
    .eq("id", optionId)
    .single();
  if (error || !data) return null;
  const owns = await assertOwnsGroup(storeId, data.option_group_id);
  return owns ? data.option_group_id : null;
}
