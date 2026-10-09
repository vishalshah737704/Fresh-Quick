// The Registrations screen tells the tab bar to refresh its pending badge after a decision,
// without waiting for the next poll.
const listeners = new Set<() => void>();

export function onAdminPendingChanged(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function notifyAdminPendingChanged(): void {
  listeners.forEach((callback) => callback());
}
