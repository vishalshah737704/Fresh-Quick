"use client";

import Image from "next/image";
import { useAddToCart } from "@/lib/use-add-to-cart";
import { ItemCustomizationModal } from "@/components/ItemCustomizationModal";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  product_attributes: { is_veg?: boolean } | null;
  is_available: boolean;
  image_url: string | null;
};

type Option = { id: string; name: string; price_delta_paise: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  menu_item_options: Option[];
};

export function FeaturedItemCard({
  item,
  storeId,
  storeName,
  disabled = false,
  optionGroups = [],
}: {
  item: MenuItem;
  storeId: string;
  storeName: string;
  disabled?: boolean;
  optionGroups?: OptionGroup[];
}) {
  const { modalOpen, setModalOpen, handleAddClick } = useAddToCart(
    item,
    storeId,
    storeName,
    optionGroups
  );
  const canAdd = !disabled && item.is_available;

  return (
    <div className="w-40 shrink-0 snap-start overflow-hidden rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface">
      <div className="relative h-28 w-full bg-brand-accent/10">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} fill sizes="160px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl">🍽️</div>
        )}
        <button
          disabled={!canAdd}
          onClick={handleAddClick}
          aria-label={`Add ${item.name}`}
          className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent text-base font-bold leading-none text-brand-ink shadow-md disabled:cursor-not-allowed disabled:bg-brand-ink-muted/30 disabled:text-brand-ink-muted disabled:opacity-60"
        >
          +
        </button>
      </div>
      <div className="p-2">
        <p className="line-clamp-1 text-sm font-semibold text-brand-ink">
          {item.product_attributes?.is_veg ? "🟢" : "🔴"} {item.name}
        </p>
        <p className="mt-1 inline-block rounded-[var(--radius-pill)] bg-brand-accent px-2 py-0.5 text-xs font-semibold text-white">
          ₹{item.price.toFixed(2)}
        </p>
      </div>
      {modalOpen && (
        <ItemCustomizationModal
          item={item}
          optionGroups={optionGroups}
          storeId={storeId}
          storeName={storeName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
