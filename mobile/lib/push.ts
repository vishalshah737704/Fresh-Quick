// Best-effort push registration. Everything is lazy-required and wrapped in try/catch so Expo Go
// limitations (no remote push on Android Expo Go, missing EAS projectId) never crash or show errors.
import { useEffect } from "react";
import { Platform } from "react-native";
import { apiFetch } from "./api";

type Fetcher = typeof apiFetch;

let handlerSet = false;
let registeredToken: string | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setForegroundHandler(Notifications: any) {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPush(fetcher: Fetcher): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications");
    setForegroundHandler(Notifications);
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const result = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token: string | undefined = result?.data;
    if (!token) return;

    await fetcher("/api/notifications/devices", { method: "POST", body: { token, platform: Platform.OS } });
    registeredToken = token;
  } catch {
    // Push is optional: ignore every failure.
  }
}

// Call BEFORE supabase.auth.signOut() so the request is still authenticated.
export async function unregisterPush(fetcher: Fetcher): Promise<void> {
  const token = registeredToken;
  if (!token) return;
  registeredToken = null;
  try {
    await fetcher("/api/notifications/devices", { method: "DELETE", body: { token } });
  } catch {
    // ignore
  }
}

// Mount on a screen that already requires a session.
export function usePushRegistration(): void {
  useEffect(() => {
    registerForPush(apiFetch);
  }, []);
}
