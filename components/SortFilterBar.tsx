export type SortOption = "distance" | "rating" | "deliveryFee" | "prepTime";

const SORT_LABELS: Record<SortOption, string> = {
  distance: "Distance",
  rating: "Rating",
  deliveryFee: "Delivery fee",
  prepTime: "Prep time",
};

export function SortFilterBar({
  sortBy,
  onSortByChange,
  under30,
  onUnder30Toggle,
}: {
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  under30: boolean;
  onUnder30Toggle: (value: boolean) => void;
}) {
  function toggleSort(option: SortOption) {
    onSortByChange(sortBy === option ? "distance" : option);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => toggleSort("rating")}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          sortBy === "rating"
            ? "border-brand-primary bg-brand-primary text-white"
            : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
        }`}
      >
        Rating
      </button>
      <button
        onClick={() => toggleSort("deliveryFee")}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          sortBy === "deliveryFee"
            ? "border-brand-primary bg-brand-primary text-white"
            : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
        }`}
      >
        Delivery fee
      </button>
      <button
        onClick={() => onUnder30Toggle(!under30)}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          under30
            ? "border-brand-primary bg-brand-primary text-white"
            : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
        }`}
      >
        Under 30 min
      </button>
      <select
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value as SortOption)}
        className="rounded-full border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink focus:border-brand-primary focus:outline-none"
      >
        {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
          <option key={option} value={option}>
            Sort: {SORT_LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
