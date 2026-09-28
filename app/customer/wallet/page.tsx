export default function WalletPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-ink">Wallet</h1>
      <p className="mb-4 text-sm text-brand-ink-muted">
        Payment methods used at checkout on this account.
      </p>
      <div className="flex flex-col gap-3">
        {[
          { icon: "💳", label: "Mock Card" },
          { icon: "📱", label: "Mock UPI" },
          { icon: "💵", label: "Cash on Delivery" },
        ].map((method) => (
          <div
            key={method.label}
            className="flex items-center gap-3 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4"
          >
            <span className="text-lg">{method.icon}</span>
            <span className="font-medium text-brand-ink">{method.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-brand-ink-muted">
        These are the payment options available at checkout — this app uses mock payments only,
        no real card or bank details are stored.
      </p>
    </div>
  );
}
