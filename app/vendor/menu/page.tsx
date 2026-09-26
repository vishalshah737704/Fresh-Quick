"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
};

type OptionValue = { id: string; name: string; price_delta_paise: number; sort_order: number };
type OptionGroupValue = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  menu_item_options: OptionValue[];
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorMenuPage() {
  const { loading } = useVendorSession();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsVeg, setEditIsVeg] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);
  const [groupsByItem, setGroupsByItem] = useState<Record<string, OptionGroupValue[]>>({});
  const [groupName, setGroupName] = useState("");
  const [groupMin, setGroupMin] = useState("0");
  const [groupMax, setGroupMax] = useState("1");
  const [optionForms, setOptionForms] = useState<Record<string, { name: string; price: string }>>({});
  const [optionsError, setOptionsError] = useState<string | null>(null);

  async function loadGroups(itemId: string) {
    const res = await fetch(`/api/vendor/menu-items/${itemId}/option-groups`, {
      headers: await authHeader(),
    });
    const body = await res.json();
    if (res.ok) setGroupsByItem((prev) => ({ ...prev, [itemId]: body.groups }));
  }

  function toggleOptions(itemId: string) {
    if (optionsOpenId === itemId) {
      setOptionsOpenId(null);
      return;
    }
    setOptionsOpenId(itemId);
    setOptionsError(null);
    if (!groupsByItem[itemId]) loadGroups(itemId);
  }

  async function addGroup(itemId: string) {
    setOptionsError(null);
    const min = Number(groupMin);
    const max = Number(groupMax);
    if (
      !groupName.trim() ||
      !Number.isInteger(min) ||
      min < 0 ||
      !Number.isInteger(max) ||
      max < 1 ||
      max < min
    ) {
      setOptionsError("Group needs a name and valid min/max select counts");
      return;
    }
    const res = await fetch(`/api/vendor/menu-items/${itemId}/option-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ name: groupName, minSelect: min, maxSelect: max }),
    });
    const body = await res.json();
    if (!res.ok) {
      setOptionsError(body.error ?? "Failed to add option group");
      return;
    }
    setGroupName("");
    setGroupMin("0");
    setGroupMax("1");
    await loadGroups(itemId);
  }

  async function deleteGroup(itemId: string, groupId: string) {
    setOptionsError(null);
    const res = await fetch(`/api/vendor/option-groups/${groupId}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setOptionsError(body.error ?? "Failed to delete option group");
      return;
    }
    await loadGroups(itemId);
  }

  async function addOption(itemId: string, groupId: string) {
    setOptionsError(null);
    const form = optionForms[groupId] ?? { name: "", price: "0" };
    const price = Number(form.price || "0");
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) {
      setOptionsError("Option needs a name and a non-negative price");
      return;
    }
    const res = await fetch(`/api/vendor/option-groups/${groupId}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ name: form.name, priceDeltaRupees: price }),
    });
    const body = await res.json();
    if (!res.ok) {
      setOptionsError(body.error ?? "Failed to add option");
      return;
    }
    setOptionForms((prev) => ({ ...prev, [groupId]: { name: "", price: "0" } }));
    await loadGroups(itemId);
  }

  async function deleteOption(itemId: string, optionId: string) {
    setOptionsError(null);
    const res = await fetch(`/api/vendor/options/${optionId}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setOptionsError(body.error ?? "Failed to delete option");
      return;
    }
    await loadGroups(itemId);
  }

  async function loadItems() {
    const res = await fetch("/api/vendor/menu-items", { headers: await authHeader() });
    const body = await res.json();
    if (res.ok) setItems(body.items);
  }

  useEffect(() => {
    if (!loading) loadItems();
  }, [loading]);

  async function addItem() {
    setError(null);
    const priceNumber = Number(price);
    if (!name || !Number.isFinite(priceNumber) || priceNumber <= 0) {
      setError("Name and a positive price are required");
      return;
    }
    const res = await fetch("/api/vendor/menu-items", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ name, price: priceNumber, imageUrl: imageUrl || undefined }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to add item");
      return;
    }
    setName("");
    setPrice("");
    setImageUrl("");
    await loadItems();
  }

  async function toggleAvailable(item: MenuItem) {
    setActionError(null);
    const res = await fetch(`/api/vendor/menu-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ isAvailable: !item.is_available }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setActionError(body?.error ?? "Failed to update item");
      return;
    }
    await loadItems();
  }

  function startEdit(item: MenuItem) {
    setEditError(null);
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description ?? "");
    setEditCategory(item.category ?? "");
    setEditIsVeg(item.is_veg);
    setEditPrice(String(item.price));
    setEditImageUrl(item.image_url ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(item: MenuItem) {
    setEditError(null);
    const priceNumber = Number(editPrice);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setEditError("Price must be a positive number");
      return;
    }
    const update: Record<string, unknown> = {};
    if (editName !== item.name) update.name = editName;
    if (editDescription !== (item.description ?? "")) update.description = editDescription;
    if (editCategory !== (item.category ?? "")) update.category = editCategory;
    if (editIsVeg !== item.is_veg) update.isVeg = editIsVeg;
    if (editImageUrl !== (item.image_url ?? "")) update.imageUrl = editImageUrl;
    if (priceNumber !== item.price) update.price = priceNumber;

    const res = await fetch(`/api/vendor/menu-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(update),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setEditError(body?.error ?? "Failed to update item");
      return;
    }
    setEditingId(null);
    await loadItems();
  }

  async function deleteItem(id: string) {
    setActionError(null);
    const res = await fetch(`/api/vendor/menu-items/${id}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setActionError(body.error ?? "Failed to delete item");
      return;
    }
    await loadItems();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-brand-ink">Menu</h1>
      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      <div className="mb-6 flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          placeholder="Price (rupees)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={addItem}
          className="rounded-full bg-brand-primary px-3 py-2 text-sm text-white"
        >
          Add item
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-brand-ink-muted">
                  ₹{item.price.toFixed(2)} · {item.is_available ? "Available" : "Unavailable"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => (editingId === item.id ? cancelEdit() : startEdit(item))}
                  className="rounded-lg bg-brand-accent/10 px-2 py-1 text-xs text-brand-ink"
                >
                  {editingId === item.id ? "Cancel" : "Edit"}
                </button>
                <button
                  onClick={() => toggleAvailable(item)}
                  className="rounded-lg bg-brand-accent/10 px-2 py-1 text-xs text-brand-ink"
                >
                  {item.is_available ? "Mark unavailable" : "Mark available"}
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="rounded bg-red-100 px-2 py-1 text-xs text-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => toggleOptions(item.id)}
                  className="rounded-lg bg-brand-accent/10 px-2 py-1 text-xs text-brand-ink"
                >
                  {optionsOpenId === item.id ? "Hide options" : "Options"}
                </button>
              </div>
            </div>
            {editingId === item.id && (
              <div className="flex flex-col gap-2 rounded border bg-brand-accent/5 p-2">
                <input
                  className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
                  placeholder="Name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <input
                  className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
                  placeholder="Description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <input
                  className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
                  placeholder="Category"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editIsVeg}
                    onChange={(e) => setEditIsVeg(e.target.checked)}
                  />
                  Veg
                </label>
                <input
                  className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
                  placeholder="Price (rupees)"
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
                <input
                  className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
                  placeholder="Image URL"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                />
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <button
                  onClick={() => saveEdit(item)}
                  className="rounded-full bg-brand-primary px-3 py-2 text-sm text-white"
                >
                  Save
                </button>
              </div>
            )}
            {optionsOpenId === item.id && (
              <div className="flex flex-col gap-3 rounded border bg-brand-accent/5 p-2">
                {optionsError && <p className="text-sm text-red-600">{optionsError}</p>}
                <div className="flex flex-col gap-1 rounded border border-brand-ink-muted/15 p-2">
                  <p className="text-xs font-semibold text-brand-ink">Add option group</p>
                  <input
                    className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
                    placeholder="Group name (e.g. Size)"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <input
                      className="w-1/2 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
                      placeholder="Min select"
                      type="number"
                      value={groupMin}
                      onChange={(e) => setGroupMin(e.target.value)}
                    />
                    <input
                      className="w-1/2 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
                      placeholder="Max select"
                      type="number"
                      value={groupMax}
                      onChange={(e) => setGroupMax(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => addGroup(item.id)}
                    className="mt-1 self-start rounded-full bg-brand-primary px-3 py-1 text-xs text-white"
                  >
                    Add group
                  </button>
                </div>
                {(groupsByItem[item.id] ?? []).map((group) => (
                  <div key={group.id} className="rounded border border-brand-ink-muted/15 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-brand-ink">
                        {group.name}{" "}
                        <span className="text-xs font-normal text-brand-ink-muted">
                          (min {group.min_select}, max {group.max_select})
                        </span>
                      </p>
                      <button
                        onClick={() => deleteGroup(item.id, group.id)}
                        className="rounded bg-red-100 px-2 py-1 text-xs text-red-700"
                      >
                        Delete group
                      </button>
                    </div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {group.menu_item_options.map((option) => (
                        <li key={option.id} className="flex items-center justify-between text-sm">
                          <span>
                            {option.name} · +₹{(option.price_delta_paise / 100).toFixed(2)}
                          </span>
                          <button
                            onClick={() => deleteOption(item.id, option.id)}
                            className="text-xs text-red-600"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="flex-1 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
                        placeholder="Option name"
                        value={optionForms[group.id]?.name ?? ""}
                        onChange={(e) =>
                          setOptionForms((prev) => ({
                            ...prev,
                            [group.id]: { name: e.target.value, price: prev[group.id]?.price ?? "0" },
                          }))
                        }
                      />
                      <input
                        className="w-24 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
                        placeholder="+₹"
                        type="number"
                        value={optionForms[group.id]?.price ?? "0"}
                        onChange={(e) =>
                          setOptionForms((prev) => ({
                            ...prev,
                            [group.id]: { name: prev[group.id]?.name ?? "", price: e.target.value },
                          }))
                        }
                      />
                      <button
                        onClick={() => addOption(item.id, group.id)}
                        className="rounded-full bg-brand-primary px-3 py-1 text-xs text-white"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
