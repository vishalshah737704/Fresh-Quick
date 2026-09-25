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
      <div className="mb-6 flex flex-col gap-2 rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-3">
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
          <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-2">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
