"use client";

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

export default function VendorNotificationsPage() {
  return <NotificationsPanel orderHref={() => "/vendor/orders"} />;
}
