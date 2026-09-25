type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
};

export function RestaurantCard({
  restaurant,
  distanceKm,
}: {
  restaurant: Restaurant;
  distanceKm: number;
}) {
  return (
    <a
      href={`/customer/restaurants/${restaurant.id}`}
      className="block rounded-lg border border-gray-200 p-4 hover:border-brand-primary"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{restaurant.name}</h3>
        <span className="text-sm text-gray-500">{distanceKm.toFixed(1)} km</span>
      </div>
      <p className="text-sm text-gray-500">{restaurant.cuisine_tags.join(", ")}</p>
      <div className="mt-1 flex items-center gap-3 text-sm">
        <span>⭐ {restaurant.rating.toFixed(1)}</span>
        <span>{restaurant.avg_prep_minutes} min</span>
      </div>
    </a>
  );
}
