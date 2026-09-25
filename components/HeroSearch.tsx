import { BRAND } from "@/lib/branding";

export function HeroSearch() {
  return (
    <section className="rounded-lg bg-brand-primary px-6 py-10 text-white">
      <h1 className="font-heading text-3xl">{BRAND.name}</h1>
      <p className="mt-2 text-white/90">Fresh food, delivered fast.</p>
    </section>
  );
}
