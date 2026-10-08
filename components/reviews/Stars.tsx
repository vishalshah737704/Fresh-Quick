"use client";

export function StarsDisplay({ value, className = "" }: { value: number; className?: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span aria-label={`${value} out of 5 stars`} role="img" className={`text-brand-primary-text-safe ${className}`}>
      {"★".repeat(filled)}
      <span className="text-brand-ink-muted/50">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

export function StarInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (stars: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((stars) => (
        <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={`${stars} star${stars === 1 ? "" : "s"}`}
          onClick={() => onChange(value === stars ? 0 : stars)}
          className={`text-2xl leading-none ${stars <= value ? "text-brand-primary-text-safe" : "text-brand-ink-muted/50"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
