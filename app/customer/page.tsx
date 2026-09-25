"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAddress } from "@/lib/address-store";
import { haversineDistanceKm } from "@/lib/geo";
import { RestaurantCard } from "@/components/RestaurantCard";
import { HeroSearch } from "@/components/HeroSearch";
import { PromoBanner } from "@/components/PromoBanner";
import { CuisineChipRow } from "@/components/CuisineChipRow";
import { CuisineCarouselRow } from "@/components/CuisineCarouselRow";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";

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
  const [searchQuery, setSearchQuery] = useState("");
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

  const withDistance = restaurants
    .map((r) => ({ r, distanceKm: haversineDistanceKm(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (r: Restaurant) =>
    query === "" ||
    r.name.toLowerCase().includes(query) ||
    r.cuisine_tags.some((tag) => tag.toLowerCase().includes(query));

  const searched = withDistance.filter(({ r }) => matchesQuery(r));

  const filtered = searched.filter(
    ({ r }) => selectedCuisine === null || r.cuisine_tags.includes(selectedCuisine)
  );

  // Group by cuisine for the carousel view. A restaurant with multiple
  // cuisine_tags appears once per matching tag it has, not just its first.
  const byCuisine = cuisines.map((c) => ({
    cuisine: c,
    restaurants: searched
      .filter(({ r }) => r.cuisine_tags.includes(c.slug))
      .map(({ r, distanceKm }) => ({ restaurant: r, distanceKm })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <HeroSearch />
      <PromoBanner message="Free delivery on your first order 🎉" />
      <HeaderSearchBox value={searchQuery} onChange={setSearchQuery} />
      <CuisineChipRow cuisines={cuisines} selected={selectedCuisine} onSelect={setSelectedCuisine} />
      <div id="restaurants" />
      {restaurants.length === 0 ? (
        <p className="text-brand-ink-muted">No open restaurants near you right now.</p>
      ) : selectedCuisine !== null ? (
        filtered.length === 0 ? (
          <p className="text-brand-ink-muted">No restaurants match that cuisine right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ r, distanceKm }) => (
              <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
            ))}
          </div>
        )
      ) : searched.length === 0 ? (
        <p className="text-brand-ink-muted">No restaurants match &quot;{searchQuery}&quot;.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {byCuisine.map(({ cuisine, restaurants: rows }) => (
            <CuisineCarouselRow key={cuisine.slug} label={cuisine.label} restaurants={rows} />
          ))}
        </div>
      )}
    </div>
  );
}
