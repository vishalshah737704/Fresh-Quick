import { CuisineChip } from "./CuisineChip";

export function CuisineChipRow({
  cuisines,
  selected,
  onSelect,
}: {
  cuisines: { slug: string; label: string }[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <CuisineChip label="All" active={selected === null} onClick={() => onSelect(null)} />
      {cuisines.map((c) => (
        <CuisineChip
          key={c.slug}
          label={c.label}
          active={selected === c.slug}
          onClick={() => onSelect(c.slug)}
        />
      ))}
    </div>
  );
}
