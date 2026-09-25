import Image from "next/image";
import Link from "next/link";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  banner_url: string | null;
};

export function RestaurantCard({
  restaurant,
  distanceKm,
}: {
  restaurant: Restaurant;
  distanceKm: number;
}) {
  return (
    <Link
      href={`/customer/restaurants/${restaurant.id}`}
      className="block overflow-hidden rounded-xl border border-brand-ink-muted/10 bg-brand-surface shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 w-full bg-brand-accent/10">
        {restaurant.banner_url ? (
          <Image
            src={restaurant.banner_url}
            alt={restaurant.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🍽️</div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-xs font-semibold shadow">
          ⭐ {restaurant.rating.toFixed(1)}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-ink">{restaurant.name}</h3>
          <span className="text-sm text-brand-ink-muted">{distanceKm.toFixed(1)} km</span>
        </div>
        <p className="text-sm text-brand-ink-muted">{restaurant.cuisine_tags.join(", ")}</p>
        <span className="mt-1 inline-block rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-ink">
          {restaurant.avg_prep_minutes} min
        </span>
      </div>
    </Link>
  );
}
