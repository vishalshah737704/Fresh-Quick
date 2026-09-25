import { ReactNode } from "react";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";
import { CartConflictDialog } from "@/components/CartConflictDialog";
import { CartPanel } from "@/components/CartPanel";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <AddressPicker />
        <CartConflictDialog />
        <main className="mx-auto max-w-3xl p-4 pb-24">{children}</main>
        <CartPanel />
      </CartProvider>
    </AddressProvider>
  );
}
