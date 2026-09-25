import { RestaurantCard } from "./RestaurantCard";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  banner_url: string | null;
};

export function CuisineCarouselRow({
  label,
  restaurants,
}: {
  label: string;
  restaurants: { restaurant: Restaurant; distanceKm: number }[];
}) {
  if (restaurants.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-lg font-bold text-brand-ink">{label}</h2>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {restaurants.map(({ restaurant, distanceKm }) => (
          <div key={restaurant.id} className="w-64 shrink-0 snap-start">
            <RestaurantCard restaurant={restaurant} distanceKm={distanceKm} />
          </div>
        ))}
      </div>
    </section>
  );
}
