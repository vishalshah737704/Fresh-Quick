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

  return (
    <div className="flex items-center justify-between border-b border-brand-ink-muted/10 py-4">
      <div className="flex items-center gap-4">
        {item.image_url && (
          <Image
            src={item.image_url}
            alt={item.name}
            width={80}
            height={80}
            className="h-20 w-20 rounded-lg object-cover"
          />
        )}
        <div>
          <p className="font-medium text-brand-ink">
            {item.is_veg ? "🟢" : "🔴"} {item.name}
          </p>
          {item.description && (
            <p className="text-sm text-brand-ink-muted">{item.description}</p>
          )}
          <p className="text-sm font-medium text-brand-ink">₹{item.price.toFixed(2)}</p>
        </div>
      </div>
      <button
        disabled={disabled || !item.is_available}
        onClick={() =>
          addItem(restaurantId, restaurantName, {
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
          })
        }
        className="rounded-full bg-brand-primary px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-brand-ink-muted/30"
      >
        {disabled ? "Unavailable" : item.is_available ? "Add" : "Unavailable"}
      </button>
    </div>
  );
}
