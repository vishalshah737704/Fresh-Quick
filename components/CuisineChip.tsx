export function CuisineChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
      }`}
    >
      {label}
    </button>
  );
}
