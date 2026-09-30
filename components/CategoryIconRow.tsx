"use client";

import Image from "next/image";
import Link from "next/link";
import { CATEGORY_ICONS, CATEGORY_ORDER, type CategoryType } from "@/lib/category-icons";
import { ScrollArrowRow } from "./ScrollArrowRow";

export function CategoryIconRow({ activeCategory }: { activeCategory: CategoryType | null }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-brand-primary-tint px-4 py-4">
      <ScrollArrowRow>
        <Link
          href="/customer"
          className="flex w-20 shrink-0 flex-col items-center gap-2 snap-start"
        >
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-2xl ${
              activeCategory === null
                ? "border-brand-ink bg-brand-ink/10"
                : "border-brand-ink-muted/15 bg-brand-surface"
            }`}
          >
            🏠
          </span>
          <span className="text-center text-xs font-medium text-brand-ink">All</span>
        </Link>
        {CATEGORY_ORDER.map((category) => {
          const { label, icon } = CATEGORY_ICONS[category];
          const active = activeCategory === category;
          return (
            <Link
              key={category}
              href={`/customer?category=${category}`}
              className="flex w-20 shrink-0 flex-col items-center gap-2 snap-start"
            >
              <span
                className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 ${
                  active ? "border-brand-ink" : "border-brand-ink-muted/15"
                }`}
              >
                <Image src={icon} alt="" width={64} height={64} className="h-full w-full object-cover" />
              </span>
              <span className="text-center text-xs font-medium text-brand-ink">{label}</span>
            </Link>
          );
        })}
      </ScrollArrowRow>
    </div>
  );
}
