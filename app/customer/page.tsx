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
import { SortFilterBar, type SortOption } from "@/components/SortFilterBar";

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
  delivery_fee_paise: number;
  promo_text: string | null;
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
  const [sortBy, setSortBy] = useState<SortOption>("distance");
  const [under30, setUnder30] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data, error: fetchError }, { data: cuisineData }] = await Promise.all([
        supabase
          .from("restaurants")
          .select(
            "id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng, banner_url, delivery_fee_paise, promo_text"
          )
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

  const labelBySlug = new Map(cuisines.map((c) => [c.slug, c.label.toLowerCase()]));

  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (r: Restaurant) =>
    query === "" ||
    r.name.toLowerCase().includes(query) ||
    r.cuisine_tags.some(
      (tag) => tag.toLowerCase().includes(query) || (labelBySlug.get(tag) ?? "").includes(query)
    );

  // "Under 30 min" narrows every downstream view (carousels, grids, curated
  // sections) — same precedent as selectedCuisine already narrowing
  // everything via `filtered`. See plan's Global Constraints for why this
  // differs from the sort dropdown, which only reorders the two flat-grid
  // paths below.
  const searched = withDistance.filter(
    ({ r }) => matchesQuery(r) && (!under30 || r.avg_prep_minutes < 30)
  );

  const filtered = searched.filter(
    ({ r }) => selectedCuisine === null || r.cuisine_tags.includes(selectedCuisine)
  );

  function applySort<T extends { r: Restaurant; distanceKm: number }>(rows: T[]): T[] {
    const sorted = [...rows];
    if (sortBy === "rating") sorted.sort((a, b) => b.r.rating - a.r.rating);
    else if (sortBy === "deliveryFee") sorted.sort((a, b) => a.r.delivery_fee_paise - b.r.delivery_fee_paise);
    else if (sortBy === "prepTime") sorted.sort((a, b) => a.r.avg_prep_minutes - b.r.avg_prep_minutes);
    // "distance" is already the incoming order (withDistance is pre-sorted).
    return sorted;
  }

  const sortedFiltered = applySort(filtered);
  const sortedSearched = applySort(searched);

  // Curated carousels — each derived from `searched` (post-filter,
  // pre-cuisine-selection), independent of the sort/filter bar's sort
  // choice per the plan's Global Constraints ruling.
  const toCarouselRows = (rows: { r: Restaurant; distanceKm: number }[]) =>
    rows.map(({ r, distanceKm }) => ({ restaurant: r, distanceKm }));

  const popularNearYou = toCarouselRows(
    [...searched].sort((a, b) => b.r.rating - a.r.rating).slice(0, 10)
  );
  const offersNearYou = toCarouselRows(searched.filter(({ r }) => r.promo_text !== null));
  const quickDelivery = toCarouselRows(
    searched.filter(({ r }) => r.avg_prep_minutes < 30).slice(0, 10)
  );

  // Group by cuisine for the carousel view. A restaurant with multiple
  // cuisine_tags appears once per matching tag it has, not just its first.
  const byCuisine = cuisines.map((c) => ({
    cuisine: c,
    restaurants: searched
      .filter(({ r }) => r.cuisine_tags.includes(c.slug))
      .map(({ r, distanceKm }) => ({ restaurant: r, distanceKm })),
  }));

  // Restaurants with no cuisine tag matching any known taxonomy slug (e.g. a
  // freshly signed-up vendor with cuisine_tags: []) or a failed/empty
  // cuisine_taxonomy fetch must never silently vanish from the carousel
  // view — fall back to the flat grid whenever any searched restaurant
  // isn't represented in a single carousel row.
  const groupedIds = new Set(byCuisine.flatMap(({ restaurants }) => restaurants.map(({ restaurant }) => restaurant.id)));
  const hasUngroupedRestaurant = searched.some(({ r }) => !groupedIds.has(r.id));
  const useCarouselView = cuisines.length > 0 && !hasUngroupedRestaurant;

  return (
    <div className="flex flex-col gap-6">
      <HeroSearch />
      <PromoBanner message="Free delivery on your first order 🎉" />
      <HeaderSearchBox
        value={searchQuery}
        onChange={setSearchQuery}
        restaurants={restaurants.map((r) => ({ id: r.id, name: r.name, cuisine_tags: r.cuisine_tags }))}
        cuisines={cuisines}
      />
      <SortFilterBar sortBy={sortBy} onSortByChange={setSortBy} under30={under30} onUnder30Toggle={setUnder30} />
      <CuisineChipRow cuisines={cuisines} selected={selectedCuisine} onSelect={setSelectedCuisine} />
      <div id="restaurants" />
      {restaurants.length === 0 ? (
        <p className="text-brand-ink-muted">No open restaurants near you right now.</p>
      ) : selectedCuisine !== null ? (
        sortedFiltered.length === 0 ? (
          <p className="text-brand-ink-muted">No restaurants match that cuisine right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedFiltered.map(({ r, distanceKm }) => (
              <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
            ))}
          </div>
        )
      ) : searched.length === 0 ? (
        <p className="text-brand-ink-muted">
          {under30 ? (
            searchQuery.trim() === "" ? (
              "No restaurants deliver in under 30 min right now."
            ) : (
              <>No restaurants under 30 min match &quot;{searchQuery}&quot;.</>
            )
          ) : (
            <>No restaurants match &quot;{searchQuery}&quot;.</>
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <CuisineCarouselRow label="Popular near you" restaurants={popularNearYou} />
          <CuisineCarouselRow label="Offers near you" restaurants={offersNearYou} />
          <CuisineCarouselRow label="Quick delivery" restaurants={quickDelivery} />
          {useCarouselView ? (
            byCuisine.map(({ cuisine, restaurants: rows }) => (
              <CuisineCarouselRow key={cuisine.slug} label={cuisine.label} restaurants={rows} />
            ))
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedSearched.map(({ r, distanceKm }) => (
                <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
