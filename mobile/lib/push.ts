// Best-effort push registration. Everything is lazy-required and wrapped in try/catch so Expo Go
// limitations (no remote push on Android Expo Go, missing EAS projectId) never crash or show errors.
import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { apiFetch } from "./api";
import { supabase } from "./supabase";
import { pushTapTarget } from "./push-target";

type Fetcher = typeof apiFetch;

// Android Expo Go cannot do remote push (removed in SDK 53) and loading expo-notifications there
// logs an error that dev mode shows as a red screen, so never load it in that case.
function pushUnsupported(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-constants").default?.executionEnvironment === "storeClient";
  } catch {
    return false;
  }
}

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
  if (pushUnsupported()) return;
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

// Mount once in the root layout. Opens the right screen when a push is tapped while the app is
// alive (foreground or background). A cold start after the app was closed is not handled: the root
// layout signs out on every fresh launch, so there is no session to open an order with.
export function usePushTapHandler(): void {
  useEffect(() => {
    if (pushUnsupported()) return;
    let subscription: { remove: () => void } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require("expo-notifications");
      subscription = Notifications.addNotificationResponseReceivedListener(
        async (response: { notification?: { request?: { content?: { data?: unknown } } } }) => {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData.session?.user.id;
            if (!userId) return;
            const { data: profile } = await supabase.from("users").select("role").eq("id", userId).maybeSingle();
            const target = pushTapTarget(profile?.role, response.notification?.request?.content?.data);
            if (target) router.navigate(target as never);
          } catch {
            // ignore: a failed tap just leaves the app where it is
          }
        }
      );
    } catch {
      // expo-notifications unavailable: nothing to listen to
    }
    return () => subscription?.remove();
  }, []);
}
