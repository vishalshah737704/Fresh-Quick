"use client";

import { useState } from "react";
import { useCart, SelectedOption } from "@/lib/cart-store";

type Option = { id: string; name: string; price_delta_paise: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  menu_item_options: Option[];
};

type Item = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
};

export function ItemCustomizationModal({
  item,
  optionGroups,
  restaurantId,
  restaurantName,
  onClose,
}: {
  item: Item;
  optionGroups: OptionGroup[];
  restaurantId: string;
  restaurantName: string;
  onClose: () => void;
}) {
  const { addItem } = useCart();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = useState(1);

  function isSelected(groupId: string, optionId: string) {
    return selected[groupId]?.has(optionId) ?? false;
  }

  function toggleOption(group: OptionGroup, optionId: string) {
    setSelected((prev) => {
      const current = new Set(prev[group.id] ?? []);
      if (group.max_select === 1) {
        return { ...prev, [group.id]: current.has(optionId) ? new Set() : new Set([optionId]) };
      }
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (current.size >= group.max_select) return prev;
        current.add(optionId);
      }
      return { ...prev, [group.id]: current };
    });
  }

  const allGroupsValid = optionGroups.every((group) => {
    const count = selected[group.id]?.size ?? 0;
    return count >= group.min_select && count <= group.max_select;
  });

  const selectedOptions: SelectedOption[] = optionGroups.flatMap((group) =>
    Array.from(selected[group.id] ?? []).map((optionId) => {
      const option = group.menu_item_options.find((o) => o.id === optionId)!;
      return {
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDeltaPaise: option.price_delta_paise,
      };
    })
  );

  const unitPricePaise =
    Math.round(item.price * 100) + selectedOptions.reduce((sum, o) => sum + o.priceDeltaPaise, 0);
  const totalPaise = unitPricePaise * quantity;

  function handleAdd() {
    if (!allGroupsValid) return;
    addItem(restaurantId, restaurantName, {
      menuItemId: item.id,
      name: item.name,
      price: unitPricePaise / 100,
      quantity,
      imageUrl: item.image_url,
      selectedOptions,
      specialInstructions: null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-lg bg-brand-surface p-4 sm:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-ink">{item.name}</h2>
          <button onClick={onClose} className="text-brand-ink-muted" aria-label="Close">
            ✕
          </button>
        </div>
        {optionGroups.map((group) => (
          <div key={group.id} className="mb-4">
            <p className="mb-1 text-sm font-semibold text-brand-ink">
              {group.name}
              <span className="ml-2 text-xs font-normal text-brand-ink-muted">
                {group.min_select > 0
                  ? `Required · choose ${
                      group.min_select === group.max_select
                        ? group.min_select
                        : `${group.min_select}-${group.max_select}`
                    }`
                  : `Optional · up to ${group.max_select}`}
              </span>
            </p>
            <div className="flex flex-col gap-1">
              {group.menu_item_options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-brand-ink-muted/15 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={group.max_select === 1 ? "radio" : "checkbox"}
                      name={group.id}
                      checked={isSelected(group.id, option.id)}
                      onChange={() => toggleOption(group, option.id)}
                      className="accent-brand-primary"
                    />
                    {option.name}
                  </span>
                  {option.price_delta_paise > 0 && (
                    <span className="text-brand-ink-muted">
                      +₹{(option.price_delta_paise / 100).toFixed(2)}
                    </span>
                  )}
                </label>
              ))}
              {group.menu_item_options.length === 0 && (
                <p className="text-xs text-brand-ink-muted">No options available yet.</p>
              )}
            </div>
          </div>
        ))}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-brand-ink">Quantity</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="rounded-full border border-brand-ink-muted/20 px-2"
            >
              −
            </button>
            <span>{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="rounded-full border border-brand-ink-muted/20 px-2"
            >
              +
            </button>
          </div>
        </div>
        <button
          disabled={!allGroupsValid}
          onClick={handleAdd}
          className="w-full rounded-full bg-brand-primary px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add {quantity} to cart · ₹{(totalPaise / 100).toFixed(2)}
        </button>
      </div>
    </div>
  );
}
