export type CategoryType =
  | "restaurant"
  | "grocery"
  | "convenience"
  | "alcohol"
  | "health"
  | "retail"
  | "pet"
  | "flowers"
  | "baby"
  | "personal_care"
  | "electronics";

export const CATEGORY_ICONS: Record<CategoryType, { label: string; icon: string }> = {
  restaurant: { label: "Restaurants", icon: "https://images.pexels.com/photos/12181619/pexels-photo-12181619.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  grocery: { label: "Grocery", icon: "https://images.pexels.com/photos/4177709/pexels-photo-4177709.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  convenience: { label: "Convenience", icon: "https://images.pexels.com/photos/34357798/pexels-photo-34357798.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  alcohol: { label: "Alcohol", icon: "https://images.pexels.com/photos/9658801/pexels-photo-9658801.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  health: { label: "Health", icon: "https://images.pexels.com/photos/3683049/pexels-photo-3683049.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  retail: { label: "Retail", icon: "https://images.pexels.com/photos/8387816/pexels-photo-8387816.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  pet: { label: "Pet", icon: "https://images.pexels.com/photos/8434633/pexels-photo-8434633.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  flowers: { label: "Flowers", icon: "https://images.pexels.com/photos/31497181/pexels-photo-31497181.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  baby: { label: "Baby", icon: "https://images.pexels.com/photos/32950999/pexels-photo-32950999.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  personal_care: { label: "Personal Care", icon: "https://images.pexels.com/photos/13534508/pexels-photo-13534508.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
  electronics: { label: "Electronics", icon: "https://images.pexels.com/photos/16888144/pexels-photo-16888144.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" },
};

export const CATEGORY_ORDER: CategoryType[] = [
  "restaurant", "grocery", "convenience", "alcohol", "health", "retail",
  "pet", "flowers", "baby", "personal_care", "electronics",
];
