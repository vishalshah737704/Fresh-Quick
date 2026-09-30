import { BRAND } from "@/lib/branding";

export function HeroSearch() {
  return (
    <section
      className="rounded-[var(--radius-card)] px-6 py-10 text-white"
      style={{
        backgroundImage:
          "linear-gradient(120deg, var(--color-brand-primary) 55%, var(--color-brand-primary-tint) 100%)",
      }}
    >
      <h1 className="font-heading text-3xl">{BRAND.name}</h1>
      <p className="mt-2 text-white/90">Fresh food, delivered fast.</p>
    </section>
  );
}
