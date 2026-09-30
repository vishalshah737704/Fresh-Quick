export function PromoBanner({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-brand-accent-tint px-4 py-2 text-sm font-medium text-brand-ink">
      {message}
    </div>
  );
}
