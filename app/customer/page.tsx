"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAddress } from "@/lib/address-store";
import { haversineDistanceKm } from "@/lib/geo";
import { RestaurantCard } from "@/components/RestaurantCard";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  lat: number;
  lng: number;
};

export default function CustomerHomePage() {
  const { lat, lng } = useAddress();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng")
        .eq("is_open", true)
        .eq("is_suspended", false);
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setRestaurants(data ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load restaurants: {error}</p>;
  }

  if (restaurants === null) {
    return <p className="text-gray-500">Loading restaurants…</p>;
  }

  if (restaurants.length === 0) {
    return <p className="text-gray-500">No open restaurants near you right now.</p>;
  }

  const sorted = [...restaurants]
    .map((r) => ({ r, distanceKm: haversineDistanceKm(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map(({ r, distanceKm }) => (
        <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
      ))}
    </div>
  );
}
