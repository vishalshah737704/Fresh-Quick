"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORY_ICONS, CATEGORY_ORDER } from "@/lib/category-icons";
import { useSession } from "@/lib/auth";

const STATIC_ITEMS_TOP = [
  { href: "/customer", label: "Home", icon: "🏠" as const },
];

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");
  const { userId } = useSession();
  const staticItemsBottom = [
    { href: userId ? "/customer/orders" : "/customer/login", label: "Orders", icon: "🧾" as const },
  ];

  return (
    <nav className="hidden h-full w-72 shrink-0 flex-col gap-2 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border-r border-brand-ink-muted/10 bg-brand-surface p-5 md:flex">
      {STATIC_ITEMS_TOP.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-4 rounded-lg px-4 py-3 text-base font-medium ${
            pathname === "/customer" && !activeCategory
              ? "bg-brand-primary/10 text-brand-primary"
              : "text-brand-ink-muted hover:bg-brand-accent/10"
          }`}
        >
          <span className="text-2xl">{item.icon}</span>
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
            className={`flex items-center gap-4 rounded-lg px-4 py-3 text-base font-medium ${
              active
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-brand-ink-muted hover:bg-brand-accent/10"
            }`}
          >
            <Image
              src={icon}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
            {label}
          </Link>
        );
      })}
      {staticItemsBottom.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`flex items-center gap-4 rounded-lg px-4 py-3 text-base font-medium ${
            pathname.startsWith("/customer/orders")
              ? "bg-brand-primary/10 text-brand-primary"
              : "text-brand-ink-muted hover:bg-brand-accent/10"
          }`}
        >
          <span className="text-2xl">{item.icon}</span>
          {item.label}
        </Link>
      ))}

      {!userId && (
        <div className="mt-auto flex flex-col gap-2 border-t border-brand-ink-muted/10 pt-4">
          <Link
            href="/customer/login"
            className="flex items-center justify-center rounded-full border border-brand-ink-muted/20 px-4 py-3 text-base font-medium text-brand-ink hover:bg-brand-accent/10"
          >
            Sign In
          </Link>
          <Link
            href="/customer/login"
            className="flex items-center justify-center rounded-full bg-brand-primary px-4 py-3 text-base font-medium text-white"
          >
            Sign Up
          </Link>
        </div>
      )}
    </nav>
  );
}
