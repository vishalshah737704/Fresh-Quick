import { ReactNode } from "react";
import Link from "next/link";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";
import { CartConflictDialog } from "@/components/CartConflictDialog";
import { CartPanel } from "@/components/CartPanel";
import { SidebarNav } from "@/components/SidebarNav";
import { DeliveryPickupToggle } from "@/components/DeliveryPickupToggle";
import { BRAND } from "@/lib/branding";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <CartConflictDialog />
        <div className="flex min-h-screen">
          <SidebarNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center gap-3 border-b border-brand-ink-muted/10 bg-brand-surface px-4 py-3">
              <Link href="/customer" className="shrink-0 text-lg font-bold text-brand-primary">
                {BRAND.name}
              </Link>
              <AddressPicker />
              <DeliveryPickupToggle />
              <div className="ml-auto flex items-center gap-3">
                <Link href="/customer/login" className="text-sm font-medium text-brand-ink-muted">
                  Sign In
                </Link>
              </div>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24">{children}</main>
          </div>
        </div>
        <CartPanel />
      </CartProvider>
    </AddressProvider>
  );
}
