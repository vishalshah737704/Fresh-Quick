export function RestaurantMenuAnchorNav({
  groups,
  activeKey,
  onSelect,
}: {
  groups: { key: string; label: string }[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-brand-ink-muted/10 bg-brand-bg py-2">
      {groups.map((group) => (
        <button
          key={group.key}
          onClick={() => onSelect(group.key)}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
            activeKey === group.key
              ? "border-brand-primary bg-brand-primary text-white"
              : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
          }`}
        >
          {group.label}
        </button>
      ))}
    </div>
  );
}
