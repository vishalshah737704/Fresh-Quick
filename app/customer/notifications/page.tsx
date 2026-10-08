"use client";

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

export default function CustomerNotificationsPage() {
  return <NotificationsPanel orderHref={(id) => `/customer/orders/${id}`} />;
}
