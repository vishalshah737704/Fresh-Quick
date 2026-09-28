"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-store";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
};

type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  menu_item_options: { id: string; name: string; price_delta_paise: number }[];
};

export function useAddToCart(
  item: MenuItem,
  storeId: string,
  storeName: string,
  optionGroups: OptionGroup[]
) {
  const { addItem } = useCart();
  const [modalOpen, setModalOpen] = useState(false);
  const hasOptions = optionGroups.length > 0;

  function handleAddClick() {
    if (hasOptions) {
      setModalOpen(true);
      return;
    }
    addItem(storeId, storeName, {
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      imageUrl: item.image_url,
      selectedOptions: [],
      specialInstructions: null,
    });
  }

  return { modalOpen, setModalOpen, handleAddClick, hasOptions };
}
