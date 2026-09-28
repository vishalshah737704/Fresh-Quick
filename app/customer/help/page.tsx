const FAQS = [
  {
    q: "How do I find restaurants or stores?",
    a: "Use the search box in the header, or browse by category from the left sidebar (Restaurants, Grocery, Convenience, and more). The home page also shows a mixed feed of nearby stores.",
  },
  {
    q: "How do I place an order?",
    a: "Add items to your cart from a store's menu page. Your cart appears as a panel on the right — review it, then go to checkout to enter contact details, delivery address, and payment method.",
  },
  {
    q: "Can I order from more than one restaurant at once?",
    a: "No — a cart can only hold items from one store at a time. Adding an item from a different store will prompt you to clear your current cart first.",
  },
  {
    q: "How do I track my order?",
    a: "After placing an order, you're taken to its order page which shows live status updates (accepted, preparing, out for delivery, delivered). You can also find past and current orders under Orders in the account menu.",
  },
  {
    q: "How do I cancel an order?",
    a: "Orders can only be cancelled by the restaurant before they're accepted, or automatically if payment fails. Once a restaurant accepts your order, it can no longer be cancelled from this app.",
  },
  {
    q: "What payment methods are supported?",
    a: "This is a demo app — all payments are mocked. You can choose Mock Card, Mock UPI, or Cash on Delivery at checkout; no real payment is processed.",
  },
];

export default function HelpPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-ink">Help</h1>
      <div className="flex flex-col gap-4">
        {FAQS.map((item) => (
          <div key={item.q} className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-1 font-semibold text-brand-ink">{item.q}</h2>
            <p className="text-sm text-brand-ink-muted">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
