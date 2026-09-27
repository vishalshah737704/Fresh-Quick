import DeliveryShell from "@/components/delivery/DeliveryShell";

export default function DeliveryPortalLayout({ children }: { children: React.ReactNode }) {
  return <DeliveryShell>{children}</DeliveryShell>;
}
