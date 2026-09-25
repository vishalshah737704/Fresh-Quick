"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAddress } from "@/lib/address-store";
import { haversineDistanceKm } from "@/lib/geo";
import { RestaurantCard } from "@/components/RestaurantCard";
import { HeroSearch } from "@/components/HeroSearch";
import { PromoBanner } from "@/components/PromoBanner";
import { CuisineChipRow } from "@/components/CuisineChipRow";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  lat: number;
  lng: number;
  banner_url: string | null;
};

type Cuisine = {
  slug: string;
  label: string;
};

export default function CustomerHomePage() {
  const { lat, lng } = useAddress();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data, error: fetchError }, { data: cuisineData }] = await Promise.all([
        supabase
          .from("restaurants")
          .select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng, banner_url")
          .eq("is_open", true)
          .eq("is_suspended", false),
        supabase.from("cuisine_taxonomy").select("slug, label").order("label"),
      ]);
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setRestaurants(data ?? []);
      setCuisines(cuisineData ?? []);
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
    return <p className="text-brand-ink-muted">Loading restaurants…</p>;
  }

  const sorted = [...restaurants]
    .map((r) => ({ r, distanceKm: haversineDistanceKm(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .filter(({ r }) => selectedCuisine === null || r.cuisine_tags.includes(selectedCuisine));

  return (
    <div className="flex flex-col gap-6">
      <HeroSearch />
      <PromoBanner message="Free delivery on your first order 🎉" />
      <CuisineChipRow cuisines={cuisines} selected={selectedCuisine} onSelect={setSelectedCuisine} />
      {restaurants.length === 0 ? (
        <p className="text-brand-ink-muted">No open restaurants near you right now.</p>
      ) : sorted.length === 0 ? (
        <p className="text-brand-ink-muted">No restaurants match that cuisine right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(({ r, distanceKm }) => (
            <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
          ))}
        </div>
      )}
    </div>
  );
}
