export function HeaderSearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search restaurants or cuisines"
      className="w-full max-w-md rounded-full border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-primary focus:outline-none"
    />
  );
}
