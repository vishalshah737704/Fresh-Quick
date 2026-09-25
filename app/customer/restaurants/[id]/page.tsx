"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { MenuItemRow } from "@/components/MenuItemRow";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
};

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  lat: number;
  lng: number;
  is_suspended: boolean;
  banner_url: string | null;
};

export default function RestaurantMenuPage() {
  const params = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: r, error: rErr }, { data: items, error: iErr }] =
        await Promise.all([
          supabase
            .from("restaurants")
            .select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng, is_suspended, banner_url")
            .eq("id", params.id)
            .single(),
          supabase
            .from("menu_items")
            .select("id, name, description, price, is_veg, is_available, image_url")
            .eq("restaurant_id", params.id),
        ]);
      if (cancelled) return;
      if (rErr || iErr) {
        setError((rErr ?? iErr)?.message ?? "Failed to load");
        return;
      }
      setRestaurant(r);
      setMenuItems(items ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load menu: {error}</p>;
  }

  if (!restaurant || menuItems === null) {
    return <p className="text-gray-500">Loading menu…</p>;
  }

  if (menuItems.length === 0) {
    return <p className="text-gray-500">{restaurant.name} has no menu items yet.</p>;
  }

  const isUnavailable = !restaurant.is_open || restaurant.is_suspended;

  return (
    <div>
      <div className="relative mb-6 h-64 w-full overflow-hidden rounded-2xl bg-brand-accent/10 shadow-sm">
        {restaurant.banner_url ? (
          <Image
            src={restaurant.banner_url}
            alt={restaurant.name}
            fill
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl">🍽️</div>
        )}
      </div>
      <h1 className="mb-1 text-2xl font-bold text-brand-ink">{restaurant.name}</h1>
      <p className="mb-4 text-sm text-brand-ink-muted">
        {restaurant.cuisine_tags.join(", ")} · ⭐ {restaurant.rating.toFixed(1)} · {restaurant.avg_prep_minutes} min
      </p>
      {isUnavailable && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {restaurant.is_suspended
            ? "This restaurant is currently unavailable."
            : "This restaurant is currently closed."}
        </div>
      )}
      <div className="flex flex-col divide-y divide-brand-ink-muted/10 rounded-xl border border-brand-ink-muted/10 bg-brand-surface">
        {menuItems.map((item) => (
          <MenuItemRow
            key={item.id}
            item={item}
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            disabled={isUnavailable}
          />
        ))}
      </div>
    </div>
  );
}
