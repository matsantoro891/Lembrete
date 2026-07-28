export type NotificationSchedulePayload = {
  notificationId: string;
  title: string;
  notifyAt: string;
};

type ServiceWorkerMessage =
  | { type: "SCHEDULE"; payload: NotificationSchedulePayload }
  | { type: "CANCEL"; payload: { notificationId: string } }
  | { type: "SYNC_ALL"; payload: { reminders: NotificationSchedulePayload[] } };

function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!supportsNotifications()) return null;

  try {
    await navigator.serviceWorker.register("/sw.js");
    return navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function postMessage(message: ServiceWorkerMessage): Promise<void> {
  const registration = await getReadyRegistration();
  registration?.active?.postMessage(message);
}

export async function registerNotificationServiceWorker(): Promise<void> {
  await getReadyRegistration();
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!supportsNotifications()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function scheduleReminderNotification(
  payload: NotificationSchedulePayload,
): Promise<void> {
  if (!supportsNotifications() || Notification.permission !== "granted") return;
  await postMessage({ type: "SCHEDULE", payload });
}

export async function cancelReminderNotification(notificationId: string): Promise<void> {
  if (!supportsNotifications()) return;
  await postMessage({ type: "CANCEL", payload: { notificationId } });
}

export async function syncReminderNotifications(
  reminders: NotificationSchedulePayload[],
): Promise<void> {
  if (!supportsNotifications() || Notification.permission !== "granted") return;
  await postMessage({ type: "SYNC_ALL", payload: { reminders } });
}
