export default function StoreLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-40 w-full rounded-lg bg-brand-accent/10" />
      <div className="mb-2 h-6 w-48 rounded bg-brand-accent/10" />
      <div className="mb-6 h-4 w-32 rounded bg-brand-accent/10" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-lg bg-brand-accent/10" />
        ))}
      </div>
    </div>
  );
}
