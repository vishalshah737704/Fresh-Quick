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
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    await fetch(`/api/vendor/menu-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ isAvailable: !item.is_available }),
    });
    await loadItems();
  }

  async function deleteItem(id: string) {
    setDeleteError(null);
    const res = await fetch(`/api/vendor/menu-items/${id}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body.error ?? "Failed to delete item");
      return;
    }
    await loadItems();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Menu</h1>
      {deleteError && <p className="mb-4 text-sm text-red-600">{deleteError}</p>}
      <div className="mb-6 flex flex-col gap-2 rounded border p-3">
        <input
          className="rounded border px-2 py-1"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Price (rupees)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={addItem}
          className="rounded bg-brand-primary px-3 py-2 text-sm text-white"
        >
          Add item
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between rounded border p-2">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-gray-500">
                ₹{item.price} · {item.is_available ? "Available" : "Unavailable"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toggleAvailable(item)}
                className="rounded bg-gray-100 px-2 py-1 text-xs"
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
          </li>
        ))}
      </ul>
    </div>
  );
}
