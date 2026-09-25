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
    <div className="flex items-center justify-between border-b border-gray-100 py-3">
      <div className="flex items-center gap-3">
        {item.image_url && (
          <Image
            src={item.image_url}
            alt={item.name}
            width={64}
            height={64}
            className="h-16 w-16 rounded object-cover"
          />
        )}
        <div>
          <p className="font-medium">
            {item.is_veg ? "🟢" : "🔴"} {item.name}
          </p>
          {item.description && (
            <p className="text-sm text-gray-500">{item.description}</p>
          )}
          <p className="text-sm">₹{item.price.toFixed(2)}</p>
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
        className="rounded bg-brand-primary px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {disabled ? "Unavailable" : item.is_available ? "Add" : "Unavailable"}
      </button>
    </div>
  );
}
