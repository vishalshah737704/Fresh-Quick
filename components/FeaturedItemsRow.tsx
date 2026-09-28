"use client";

import { ScrollArrowRow } from "@/components/ScrollArrowRow";
import { FeaturedItemCard } from "@/components/FeaturedItemCard";

type Option = { id: string; name: string; price_delta_paise: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  menu_item_options: Option[];
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  product_attributes: { is_veg?: boolean } | null;
  is_available: boolean;
  image_url: string | null;
};

export function FeaturedItemsRow({
  items,
  storeId,
  storeName,
  disabled,
  optionGroupsById,
}: {
  items: MenuItem[];
  storeId: string;
  storeName: string;
  disabled: boolean;
  optionGroupsById: Map<string, OptionGroup[]>;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-bold text-brand-ink">Featured items</h2>
      <ScrollArrowRow>
        {items.map((item) => (
          <FeaturedItemCard
            key={item.id}
            item={item}
            storeId={storeId}
            storeName={storeName}
            disabled={disabled}
            optionGroups={optionGroupsById.get(item.id) ?? []}
          />
        ))}
      </ScrollArrowRow>
    </section>
  );
}
