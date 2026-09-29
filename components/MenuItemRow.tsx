"use client";

import Image from "next/image";
import { useAddToCart } from "@/lib/use-add-to-cart";
import { ItemCustomizationModal } from "@/components/ItemCustomizationModal";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
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

export function MenuItemRow({
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
    <div className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-ink">
          {item.product_attributes?.is_veg ? "🟢" : "🔴"} {item.name}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-brand-ink-muted">{item.description}</p>
        )}
        <p className="mt-1 inline-block rounded-[var(--radius-pill)] bg-brand-accent px-2 py-0.5 text-sm font-semibold text-white">
          ₹{item.price.toFixed(2)}
        </p>
        {!canAdd && (
          <p className="mt-1 text-xs text-brand-ink-muted">
            {disabled ? "Restaurant unavailable" : "Currently unavailable"}
          </p>
        )}
      </div>
      <div className="relative h-[88px] w-[88px] shrink-0">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            width={88}
            height={88}
            className="h-[88px] w-[88px] rounded-[var(--radius-card)] object-cover"
          />
        ) : (
          <div className="h-[88px] w-[88px] rounded-[var(--radius-card)] bg-brand-accent/10" />
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
