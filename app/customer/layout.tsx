import { ReactNode, Suspense } from "react";
import Link from "next/link";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";
import { CartConflictDialog } from "@/components/CartConflictDialog";
import { CartPanel } from "@/components/CartPanel";
import { SidebarNav } from "@/components/SidebarNav";
import { DeliveryPickupToggle } from "@/components/DeliveryPickupToggle";
import { AccountMenu } from "@/components/AccountMenu";
import { BRAND } from "@/lib/branding";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <CartConflictDialog />
        <div className="flex h-screen overflow-hidden">
          <Suspense fallback={null}>
            <SidebarNav />
          </Suspense>
          <div className="flex h-full min-w-0 flex-1 flex-col">
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-brand-ink-muted/10 bg-brand-surface px-4 py-3">
              <Link href="/customer" className="shrink-0 text-lg font-bold text-brand-primary">
                {BRAND.name}
              </Link>
              <AddressPicker />
              <DeliveryPickupToggle />
              <div className="ml-auto">
                <Suspense fallback={null}>
                  <AccountMenu />
                </Suspense>
              </div>
            </header>
            <main className="w-full flex-1 overflow-y-auto p-4">{children}</main>
          </div>
          <Suspense fallback={null}>
            <CartPanel />
          </Suspense>
        </div>
      </CartProvider>
    </AddressProvider>
  );
}
