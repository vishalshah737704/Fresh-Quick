export function PromoBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-brand-accent/10 px-4 py-2 text-sm font-medium text-brand-ink">
      {message}
    </div>
  );
}
