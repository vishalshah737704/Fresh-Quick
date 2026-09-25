export function DeliveryPickupToggle() {
  return (
    <div className="flex items-center rounded-full border border-brand-ink-muted/20 bg-brand-surface p-1 text-sm">
      <span className="rounded-full bg-brand-primary px-3 py-1 font-semibold text-white">
        Delivery
      </span>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Pickup isn't available yet"
        className="cursor-not-allowed rounded-full px-3 py-1 text-brand-ink-muted/50"
      >
        Pickup
      </button>
    </div>
  );
}
