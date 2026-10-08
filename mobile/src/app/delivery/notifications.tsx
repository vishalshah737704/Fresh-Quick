import { NotificationsView } from "../../../components/NotificationsView";
import { useRequireSession } from "../../../lib/use-require-session";

export default function DeliveryNotificationsScreen() {
  useRequireSession("/login/delivery");
  return <NotificationsView role="delivery" />;
}
