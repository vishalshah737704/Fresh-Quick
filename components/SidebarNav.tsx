"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORY_ICONS, CATEGORY_ORDER } from "@/lib/category-icons";

const STATIC_ITEMS_TOP = [
  { href: "/customer", label: "Home", icon: "🏠" as const },
];
const STATIC_ITEMS_BOTTOM = [
  { href: "/customer/login", label: "Orders", icon: "🧾" as const },
  { href: "/customer/login", label: "Account", icon: "👤" as const },
];

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  return (
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-brand-ink-muted/10 bg-brand-surface p-4 md:flex">
      {STATIC_ITEMS_TOP.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            pathname === "/customer" && !activeCategory
              ? "bg-brand-primary/10 text-brand-primary"
              : "text-brand-ink-muted hover:bg-brand-accent/10"
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          {item.label}
        </Link>
      ))}
      {CATEGORY_ORDER.map((category) => {
        const { label, icon } = CATEGORY_ICONS[category];
        const active = pathname === "/customer" && activeCategory === category;
        return (
          <Link
            key={category}
            href={`/customer?category=${category}`}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-brand-ink-muted hover:bg-brand-accent/10"
            }`}
          >
            <Image
              src={icon}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded-full object-cover"
            />
            {label}
          </Link>
        );
      })}
      {STATIC_ITEMS_BOTTOM.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            pathname.startsWith(item.label === "Orders" ? "/customer/orders" : "/customer/login")
              ? "bg-brand-primary/10 text-brand-primary"
              : "text-brand-ink-muted hover:bg-brand-accent/10"
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
