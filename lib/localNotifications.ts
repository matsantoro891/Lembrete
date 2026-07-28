import {
  PERMISSION_DENIED_MESSAGE,
  isNativePlatform,
} from "./platform";

export type NotificationPermissionStatus =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

export type ReminderNotificationPayload = {
  notificationId: number;
  body: string;
  notifyAt: string;
  reminderId: string;
};

type NotificationListenerCallbacks = {
  onAction: (reminderId: string) => void;
  onReceived?: (payload: { reminderId?: string; body: string }) => void;
};

async function getLocalNotificationsModule() {
  if (!isNativePlatform()) return null;
  return import("@capacitor/local-notifications");
}

function mapPermission(display: string | undefined): NotificationPermissionStatus {
  if (display === "granted") return "granted";
  if (display === "denied") return "denied";
  return "prompt";
}

export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isNativePlatform()) return "unsupported";

  const module = await getLocalNotificationsModule();
  if (!module) return "unsupported";

  const permission = await module.LocalNotifications.checkPermissions();
  return mapPermission(permission.display);
}

export async function requestNotificationPermission(): Promise<{
  status: NotificationPermissionStatus;
  deniedMessage?: string;
}> {
  if (!isNativePlatform()) {
    return { status: "unsupported" };
  }

  const module = await getLocalNotificationsModule();
  if (!module) {
    return { status: "unsupported" };
  }

  const current = await module.LocalNotifications.checkPermissions();
  if (current.display === "granted") {
    return { status: "granted" };
  }

  if (current.display === "denied") {
    return { status: "denied", deniedMessage: PERMISSION_DENIED_MESSAGE };
  }

  const result = await module.LocalNotifications.requestPermissions();
  const status = mapPermission(result.display);
  if (status !== "granted") {
    return { status, deniedMessage: PERMISSION_DENIED_MESSAGE };
  }

  return { status: "granted" };
}

export async function ensureNotificationPermissionForReminder(): Promise<{
  status: NotificationPermissionStatus;
  deniedMessage?: string;
}> {
  const current = await checkNotificationPermission();
  if (current === "granted" || current === "denied" || current === "unsupported") {
    return { status: current, deniedMessage: current === "denied" ? PERMISSION_DENIED_MESSAGE : undefined };
  }

  return requestNotificationPermission();
}

export async function scheduleReminderNotification(
  payload: ReminderNotificationPayload,
): Promise<void> {
  if (!isNativePlatform()) return;

  const module = await getLocalNotificationsModule();
  if (!module) return;

  const permission = await checkNotificationPermission();
  if (permission !== "granted") return;

  await module.LocalNotifications.schedule({
    notifications: [
      {
        id: payload.notificationId,
        title: "Lembrete MS",
        body: payload.body,
        schedule: {
          at: new Date(payload.notifyAt),
          allowWhileIdle: true,
        },
        sound: "default",
        extra: {
          reminderId: payload.reminderId,
        },
      },
    ],
  });
}

export async function cancelReminderNotification(notificationId: number): Promise<void> {
  if (!isNativePlatform()) return;

  const module = await getLocalNotificationsModule();
  if (!module) return;

  await module.LocalNotifications.cancel({
    notifications: [{ id: notificationId }],
  });
}

export async function scheduleTestNotification(testNotificationId: number): Promise<void> {
  if (!isNativePlatform()) return;

  const module = await getLocalNotificationsModule();
  if (!module) return;

  const permission = await checkNotificationPermission();
  if (permission !== "granted") return;

  const notifyAt = new Date(Date.now() + 10_000);

  await module.LocalNotifications.schedule({
    notifications: [
      {
        id: testNotificationId,
        title: "Lembrete MS",
        body: "Esta é uma notificação de teste.",
        schedule: {
          at: notifyAt,
          allowWhileIdle: true,
        },
        sound: "default",
      },
    ],
  });
}

export async function syncReminderNotifications(
  reminders: ReminderNotificationPayload[],
): Promise<void> {
  if (!isNativePlatform()) return;

  const permission = await checkNotificationPermission();
  if (permission !== "granted") return;

  for (const reminder of reminders) {
    await scheduleReminderNotification(reminder);
  }
}

export function registerNotificationListeners(
  callbacks: NotificationListenerCallbacks,
): () => void {
  if (!isNativePlatform()) {
    return () => undefined;
  }

  let disposed = false;
  const cleanups: Array<() => void> = [];

  void (async () => {
    const module = await getLocalNotificationsModule();
    if (!module || disposed) return;

    const actionHandle = await module.LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        const reminderId = event.notification.extra?.reminderId;
        if (typeof reminderId === "string" && reminderId.length > 0) {
          callbacks.onAction(reminderId);
        }
      },
    );

    const receivedHandle = await module.LocalNotifications.addListener(
      "localNotificationReceived",
      (notification) => {
        const reminderId = notification.extra?.reminderId;
        callbacks.onReceived?.({
          reminderId: typeof reminderId === "string" ? reminderId : undefined,
          body: notification.body ?? "",
        });
      },
    );

    cleanups.push(() => actionHandle.remove());
    cleanups.push(() => receivedHandle.remove());
  })();

  return () => {
    disposed = true;
    cleanups.forEach((cleanup) => cleanup());
  };
}
