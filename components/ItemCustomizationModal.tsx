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
  storeId,
  storeName,
  onClose,
}: {
  item: Item;
  optionGroups: OptionGroup[];
  storeId: string;
  storeName: string;
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
    addItem(storeId, storeName, {
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
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-card)] bg-brand-surface pb-24 sm:rounded-[var(--radius-card)]">
        <div className="relative">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="h-40 w-full rounded-t-[var(--radius-card)] object-cover sm:rounded-t-[var(--radius-card)]"
            />
          ) : (
            <div className="h-40 w-full rounded-t-[var(--radius-card)] bg-brand-ink-muted/15" />
          )}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-surface text-brand-ink shadow"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-4 pt-3">
          <p className="mb-1 text-xs font-medium text-brand-ink-muted">
            {storeName} <span className="mx-1">›</span> {item.name}
          </p>
          <h2 className="mb-3 text-lg font-bold text-brand-ink">{item.name}</h2>
          {optionGroups.map((group) => (
            <div key={group.id} className="mb-4 overflow-hidden rounded-[var(--radius-card)] border border-brand-ink-muted/15">
              <div className="flex items-center justify-between bg-brand-ink px-3 py-2">
                <p className="text-sm font-semibold text-white">{group.name}</p>
                <span className="text-xs font-normal text-white/70">
                  {group.min_select > 0
                    ? `Required · choose ${
                        group.min_select === group.max_select
                          ? group.min_select
                          : `${group.min_select}-${group.max_select}`
                      }`
                    : `Optional · up to ${group.max_select}`}
                </span>
              </div>
              <div className="flex flex-col gap-1 p-2">
                {group.menu_item_options.map((option) => {
                  const checked = isSelected(group.id, option.id);
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center justify-between rounded-[var(--radius-pill)] border px-3 py-2 text-sm transition-colors ${
                        checked
                          ? "border-brand-accent bg-brand-accent/10"
                          : "border-brand-ink-muted/15"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={group.max_select === 1 ? "radio" : "checkbox"}
                          name={group.id}
                          checked={checked}
                          onChange={() => toggleOption(group, option.id)}
                          className="accent-brand-accent"
                        />
                        {option.name}
                      </span>
                      {option.price_delta_paise > 0 && (
                        <span className="text-brand-ink-muted">
                          +₹{(option.price_delta_paise / 100).toFixed(2)}
                        </span>
                      )}
                    </label>
                  );
                })}
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
        </div>
        <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-center justify-between gap-3 border-t border-brand-ink-muted/15 bg-brand-surface px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-4 sm:pt-0">
          <span className="rounded-[var(--radius-pill)] bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            ₹{(totalPaise / 100).toFixed(2)}
          </span>
          <button
            disabled={!allGroupsValid}
            onClick={handleAdd}
            className="flex-1 rounded-[var(--radius-pill)] bg-brand-accent px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add {quantity} to cart
          </button>
        </div>
      </div>
    </div>
  );
}
