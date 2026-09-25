"use client";

import { useCart } from "@/lib/cart-store";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
};

export function MenuItemRow({
  item,
  restaurantId,
  restaurantName,
}: {
  item: MenuItem;
  restaurantId: string;
  restaurantName: string;
}) {
  const { addItem } = useCart();

  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-3">
      <div>
        <p className="font-medium">
          {item.is_veg ? "🟢" : "🔴"} {item.name}
        </p>
        {item.description && (
          <p className="text-sm text-gray-500">{item.description}</p>
        )}
        <p className="text-sm">₹{item.price.toFixed(2)}</p>
      </div>
      <button
        disabled={!item.is_available}
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
        {item.is_available ? "Add" : "Unavailable"}
      </button>
    </div>
  );
}
