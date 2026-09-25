"use client";

import Link from "next/link";
import { useVendorSession } from "@/components/vendor/useVendorSession";

export default function VendorDashboardPage() {
  const { loading, restaurantId } = useVendorSession();

  if (loading) return <p>Loading…</p>;
  if (!restaurantId) {
    return (
      <p className="text-sm text-red-600">
        No restaurant is linked to this account. Contact support.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Vendor dashboard</h1>
      <div className="flex gap-4">
        <Link href="/vendor/menu" className="rounded bg-gray-100 px-3 py-2 text-sm">
          Manage menu
        </Link>
        <Link href="/vendor/orders" className="rounded bg-gray-100 px-3 py-2 text-sm">
          Order queue
        </Link>
      </div>
    </div>
  );
}
