import { ReactNode } from "react";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <AddressPicker />
        <main className="mx-auto max-w-3xl p-4">{children}</main>
      </CartProvider>
    </AddressProvider>
  );
}
