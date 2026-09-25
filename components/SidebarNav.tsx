"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/customer", label: "Home", icon: "🏠", match: (p: string) => p === "/customer" },
  {
    href: "/customer#restaurants",
    label: "Restaurants",
    icon: "🍽️",
    match: (p: string) => p.startsWith("/customer/restaurants"),
  },
  {
    href: "/customer/login",
    label: "Orders",
    icon: "🧾",
    match: (p: string) => p.startsWith("/customer/orders"),
  },
  {
    href: "/customer/login",
    label: "Account",
    icon: "👤",
    match: (p: string) => p.startsWith("/customer/login"),
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-brand-ink-muted/10 bg-brand-surface p-4 md:flex">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-brand-ink-muted hover:bg-brand-accent/10"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
