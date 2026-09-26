"use client";

import Image from "next/image";
import { useCart } from "@/lib/cart-store";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
};

export function MenuItemRow({
  item,
  restaurantId,
  restaurantName,
  disabled = false,
}: {
  item: MenuItem;
  restaurantId: string;
  restaurantName: string;
  disabled?: boolean;
}) {
  const { addItem } = useCart();
  const canAdd = !disabled && item.is_available;

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-ink">
          {item.is_veg ? "🟢" : "🔴"} {item.name}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-brand-ink-muted">{item.description}</p>
        )}
        <p className="mt-1 text-sm font-semibold text-brand-ink">₹{item.price.toFixed(2)}</p>
        {!canAdd && (
          <p className="mt-1 text-xs text-brand-ink-muted">
            {disabled ? "Restaurant unavailable" : "Currently unavailable"}
          </p>
        )}
      </div>
      <div className="relative h-[72px] w-[72px] shrink-0">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-lg object-cover"
          />
        ) : (
          <div className="h-[72px] w-[72px] rounded-lg bg-brand-accent/10" />
        )}
        <button
          disabled={!canAdd}
          onClick={() =>
            addItem(restaurantId, restaurantName, {
              menuItemId: item.id,
              name: item.name,
              price: item.price,
              quantity: 1,
            })
          }
          aria-label={`Add ${item.name}`}
          className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent text-base font-bold leading-none text-brand-ink shadow-md disabled:cursor-not-allowed disabled:bg-brand-ink-muted/30 disabled:text-brand-ink-muted disabled:opacity-60"
        >
          +
        </button>
      </div>
    </div>
  );
}
