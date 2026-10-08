"use client";

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

export default function DeliveryNotificationsPage() {
  return <NotificationsPanel orderHref={() => "/delivery/dashboard"} />;
}
