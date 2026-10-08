import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { apiFetch } from "./api";

// Unread notification count, refreshed whenever the screen gains focus. Failures leave it at 0.
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      apiFetch<{ unreadCount: number }>("/api/notifications")
        .then((res) => {
          if (!cancelled) setCount(res.unreadCount ?? 0);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return count;
}
