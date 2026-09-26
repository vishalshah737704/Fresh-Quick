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
  delivery_fee_paise: number;
  promo_text: string | null;
};

export function RestaurantCard({
  restaurant,
  distanceKm,
}: {
  restaurant: Restaurant;
  distanceKm: number;
}) {
  const paise = restaurant.delivery_fee_paise;
  const isFreeDelivery = paise === 0;
  const feeDisplay = paise % 100 === 0 ? (paise / 100).toFixed(0) : (paise / 100).toFixed(2);
  const feeLabel = `₹${feeDisplay} Delivery Fee`;

  return (
    <Link
      href={`/customer/restaurants/${restaurant.id}`}
      className="block overflow-hidden rounded-lg border border-brand-ink-muted/10 bg-brand-surface shadow-none transition-shadow hover:shadow-[0_3px_14px_-6px_rgba(0,0,0,0.18)]"
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
      </div>
      <div className="p-4">
        {restaurant.promo_text && (
          <span className="mb-1 inline-block rounded-full bg-brand-accent px-2 py-0.5 text-xs font-semibold text-brand-ink">
            {restaurant.promo_text}
          </span>
        )}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-ink">{restaurant.name}</h3>
          <span className="text-sm text-brand-ink-muted">{distanceKm.toFixed(1)} km</span>
        </div>
        <p className="text-sm text-brand-ink-muted">{restaurant.cuisine_tags.join(", ")}</p>
        <p className="mt-1 text-xs text-brand-ink-muted">
          ⭐ {restaurant.rating.toFixed(1)} · {restaurant.avg_prep_minutes} min ·{" "}
          <span className={isFreeDelivery ? "font-semibold text-brand-accent" : ""}>
            {feeLabel}
          </span>
        </p>
      </div>
    </Link>
  );
}
