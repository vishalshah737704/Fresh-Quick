import { NotificationsView } from "../../../components/NotificationsView";
import { useRequireSession } from "../../../lib/use-require-session";

export default function CustomerNotificationsScreen() {
  useRequireSession("/login/customer");
  return <NotificationsView role="customer" />;
}
