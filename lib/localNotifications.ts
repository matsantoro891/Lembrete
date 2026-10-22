import type {
  LocalNotificationSchema,
  LocalNotificationsPlugin,
  PendingLocalNotificationSchema,
} from "@capacitor/local-notifications";
import {
  PERMISSION_DENIED_MESSAGE,
  isNativeIOS,
  isNativePlatform,
} from "./platform";
import { getTestNotificationId } from "./notificationIds";
import { ForegroundNotificationScheduler } from "./foregroundNotifications";

export type NotificationPermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export type ReminderNotificationPayload = {
  notificationId: number;
  body: string;
  notifyAt: string;
  reminderId: string;
};

export type NotificationScheduleResult = {
  mode: "native" | "foreground";
  scheduled: boolean;
  reason?: "permission" | "past" | "limit";
};

export type NotificationSyncResult = {
  mode: "native" | "foreground";
  scheduled: number;
  deferred: number;
  deferredReminderIds: string[];
  reason?: "permission" | "limit";
};

type NotificationListenerCallbacks = {
  onAction: (reminderId: string) => void;
  onReceived?: (payload: { reminderId?: string; body: string }) => void;
};

const SOURCE = "lembrete-ms";
const FOREGROUND_DELIVERED_KEY = "lembrete-ms-foreground-delivered-v1";
const IOS_NOTIFICATION_LIMIT = 64;
let mutationQueue: Promise<void> = Promise.resolve();
let foreground: ForegroundNotificationScheduler | undefined;

// Serialize sync/save/cancel so an older schedule cannot finish after a newer
// cancellation (for example, when notifications are switched off).
function mutate<T>(action: () => Promise<T>): Promise<T> {
  const next = mutationQueue.then(action);
  mutationQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function nativePlugin(): Promise<LocalNotificationsPlugin> {
  const module = await import("@capacitor/local-notifications");
  return module.LocalNotifications;
}

function deliveredHistory(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(FOREGROUND_DELIVERED_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // In-memory deduplication remains active when storage is unavailable.
  }
  return {};
}

function browserScheduler(): ForegroundNotificationScheduler {
  if (!foreground) {
    foreground = new ForegroundNotificationScheduler({
      now: () => Date.now(),
      isVisible: () => typeof document !== "undefined" && document.visibilityState === "visible",
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      wasDelivered: (key) => typeof deliveredHistory()[key] === "number",
      markDelivered: (key) => {
        try {
          const entries = Object.entries({ ...deliveredHistory(), [key]: Date.now() })
            .filter(([, at]) => Number.isFinite(at))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 512);
          window.localStorage.setItem(FOREGROUND_DELIVERED_KEY, JSON.stringify(Object.fromEntries(entries)));
        } catch {
          // Delivery must not depend on storage access.
        }
      },
    });
  }
  return foreground;
}

function mapPermission(display: string | undefined): NotificationPermissionStatus {
  if (display === "granted" || display === "denied") return display;
  return "prompt";
}

export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isNativePlatform()) return "unsupported";
  return mapPermission((await (await nativePlugin()).checkPermissions()).display);
}

export async function requestNotificationPermission(): Promise<{
  status: NotificationPermissionStatus;
  deniedMessage?: string;
}> {
  if (!isNativePlatform()) return { status: "unsupported" };
  const plugin = await nativePlugin();
  const current = mapPermission((await plugin.checkPermissions()).display);
  if (current === "granted") return { status: current };
  if (current === "denied") return { status: current, deniedMessage: PERMISSION_DENIED_MESSAGE };
  const status = mapPermission((await plugin.requestPermissions()).display);
  return {
    status,
    ...(status === "granted" ? {} : { deniedMessage: PERMISSION_DENIED_MESSAGE }),
  };
}

export async function ensureNotificationPermissionForReminder() {
  return requestNotificationPermission();
}

function validPayload(payload: ReminderNotificationPayload): void {
  if (!Number.isInteger(payload.notificationId) || payload.notificationId <= 0 || payload.notificationId > 2_147_483_647) {
    throw new Error("Identificador de notificação inválido.");
  }
  if (!payload.reminderId || !payload.body.trim()) {
    throw new Error("O lembrete precisa de identificador e texto para programar o aviso.");
  }
}

function future(payload: ReminderNotificationPayload): boolean {
  const time = new Date(payload.notifyAt).getTime();
  return Number.isFinite(time) && time > Date.now();
}

type OwnedNotification = { id: number; title?: string; body?: string; extra?: unknown };
function extra(notification: OwnedNotification): Record<string, unknown> {
  return notification.extra && typeof notification.extra === "object"
    ? notification.extra as Record<string, unknown>
    : {};
}

function isTest(notification: OwnedNotification): boolean {
  return extra(notification).kind === "test" || (
    notification.id === getTestNotificationId() &&
    notification.title === "Lembrete MS" &&
    notification.body === "Esta é uma notificação de teste."
  );
}

function isOurs(notification: OwnedNotification): boolean {
  const data = extra(notification);
  return data.source === SOURCE || typeof data.reminderId === "string" || isTest(notification);
}

function isReminder(notification: OwnedNotification): boolean {
  return isOurs(notification) && !isTest(notification);
}

function schema(payload: ReminderNotificationPayload, test = false): LocalNotificationSchema {
  return {
    id: payload.notificationId,
    title: "Lembrete MS",
    body: payload.body,
    schedule: { at: new Date(payload.notifyAt), allowWhileIdle: true },
    sound: "default",
    extra: { source: SOURCE, reminderId: payload.reminderId, kind: test ? "test" : "reminder" },
  };
}

function matches(notification: PendingLocalNotificationSchema, payload: ReminderNotificationPayload): boolean {
  const value = notification.schedule?.at;
  const scheduledAt = value ? new Date(value).getTime() : NaN;
  return notification.body === payload.body &&
    extra(notification).reminderId === payload.reminderId &&
    scheduledAt === new Date(payload.notifyAt).getTime();
}

async function removeDelivered(plugin: LocalNotificationsPlugin, predicate: (notification: OwnedNotification) => boolean): Promise<void> {
  const delivered = await plugin.getDeliveredNotifications();
  const notifications = delivered.notifications.filter(predicate);
  if (notifications.length) await plugin.removeDeliveredNotifications({ notifications });
}

async function scheduleNative(payload: ReminderNotificationPayload, test = false): Promise<NotificationScheduleResult> {
  const plugin = await nativePlugin();
  if (!future(payload)) {
    await plugin.cancel({ notifications: [{ id: payload.notificationId }] });
    return { mode: "native", scheduled: false, reason: "past" };
  }
  if (mapPermission((await plugin.checkPermissions()).display) !== "granted") {
    await plugin.cancel({ notifications: [{ id: payload.notificationId }] });
    return { mode: "native", scheduled: false, reason: "permission" };
  }
  const pending = await plugin.getPending();
  if (isNativeIOS() && pending.notifications.filter((item) => item.id !== payload.notificationId).length >= IOS_NOTIFICATION_LIMIT) {
    return { mode: "native", scheduled: false, reason: "limit" };
  }
  const existing = pending.notifications.find((item) => item.id === payload.notificationId);
  if (existing && !(test ? isTest(existing) : isReminder(existing))) {
    throw new Error("O identificador deste aviso já está em uso por outro recurso do aplicativo.");
  }
  if (existing && matches(existing, payload)) return { mode: "native", scheduled: true };
  if (existing) {
    // The edited reminder is already persisted. If scheduling fails, leaving
    // its previous time armed would notify the user about an obsolete event.
    await plugin.cancel({ notifications: [{ id: payload.notificationId }] });
  }
  await plugin.schedule({ notifications: [schema(payload, test)] });
  return { mode: "native", scheduled: true };
}

export function scheduleReminderNotification(payload: ReminderNotificationPayload): Promise<NotificationScheduleResult> {
  validPayload(payload);
  return mutate(async () => {
    if (isNativePlatform()) return scheduleNative(payload);
    const scheduled = browserScheduler().schedule(payload);
    return { mode: "foreground", scheduled, ...(scheduled ? {} : { reason: "past" as const }) };
  });
}

export function cancelReminderNotification(notificationId: number): Promise<void> {
  return mutate(async () => {
    browserScheduler().cancel(notificationId);
    if (!isNativePlatform()) return;
    const plugin = await nativePlugin();
    await plugin.cancel({ notifications: [{ id: notificationId }] });
    await removeDelivered(plugin, (notification) => notification.id === notificationId && isOurs(notification));
  });
}

export function cancelAllReminderNotifications(): Promise<void> {
  return mutate(async () => {
    browserScheduler().cancelAll();
    if (!isNativePlatform()) return;
    const plugin = await nativePlugin();
    const pending = await plugin.getPending();
    const notifications = pending.notifications.filter(isOurs).map(({ id }) => ({ id }));
    if (notifications.length) await plugin.cancel({ notifications });
    await removeDelivered(plugin, isOurs);
  });
}

export function scheduleTestNotification(testNotificationId: number): Promise<NotificationScheduleResult> {
  const payload: ReminderNotificationPayload = {
    notificationId: testNotificationId,
    body: "Esta é uma notificação de teste.",
    notifyAt: new Date(Date.now() + 10_000).toISOString(),
    reminderId: "__notification-test__",
  };
  return mutate(async () => {
    if (isNativePlatform()) return scheduleNative(payload, true);
    const scheduled = browserScheduler().schedule(payload);
    return { mode: "foreground", scheduled, ...(scheduled ? {} : { reason: "past" as const }) };
  });
}

export function syncReminderNotifications(reminders: ReminderNotificationPayload[]): Promise<NotificationSyncResult> {
  reminders.forEach(validPayload);
  const snapshot = reminders.map((reminder) => ({ ...reminder }));
  return mutate(async () => {
    if (!isNativePlatform()) {
      return { mode: "foreground", scheduled: browserScheduler().sync(snapshot, [getTestNotificationId()]), deferred: 0, deferredReminderIds: [] };
    }
    const plugin = await nativePlugin();
    const pending = (await plugin.getPending()).notifications;
    const desired = [...new Map(snapshot.filter(future).map((item) => [item.notificationId, item])).values()]
      .sort((a, b) => new Date(a.notifyAt).getTime() - new Date(b.notifyAt).getTime());
    const otherPending = pending.filter((item) => !isReminder(item));
    const capacity = isNativeIOS() ? Math.max(0, IOS_NOTIFICATION_LIMIT - otherPending.length) : Infinity;
    const selected = desired.slice(0, capacity);
    const deferred = desired.slice(capacity);
    const selectedIds = new Set(selected.map((item) => item.notificationId));
    const obsolete = pending.filter((item) => isReminder(item) && !selectedIds.has(item.id));
    if (obsolete.length) await plugin.cancel({ notifications: obsolete.map(({ id }) => ({ id })) });
    // Completion/deletion also clears the app's already delivered notification.
    const desiredIds = new Set(snapshot.map((item) => item.notificationId));
    await removeDelivered(plugin, (notification) => isReminder(notification) && !desiredIds.has(notification.id));
    const permission = mapPermission((await plugin.checkPermissions()).display);
    if (permission !== "granted") {
      // Never leave stale requests armed after an edit while permission is denied.
      const remaining = pending.filter((item) => isReminder(item) && selectedIds.has(item.id));
      if (remaining.length) await plugin.cancel({ notifications: remaining.map(({ id }) => ({ id })) });
      return { mode: "native", scheduled: 0, deferred: desired.length, deferredReminderIds: desired.map((item) => item.reminderId), reason: "permission" };
    }
    const pendingById = new Map(pending.map((notification) => [notification.id, notification]));
    const changes = selected.filter((payload) => {
      const existing = pendingById.get(payload.notificationId);
      if (existing && !isReminder(existing)) {
        throw new Error("O identificador deste aviso já está em uso por outro recurso do aplicativo.");
      }
      return !existing || !matches(existing, payload);
    });
    const updates = changes
      .filter((payload) => pendingById.has(payload.notificationId))
      .map((payload) => ({ id: payload.notificationId }));
    // Cancel obsolete schedules before replacing them. A failed replacement
    // is reported to the UI, while the old time must never remain armed.
    if (updates.length) await plugin.cancel({ notifications: updates });
    if (changes.length) await plugin.schedule({ notifications: changes.map((payload) => schema(payload)) });
    return {
      mode: "native",
      scheduled: selected.length,
      deferred: deferred.length,
      deferredReminderIds: deferred.map((item) => item.reminderId),
      ...(deferred.length ? { reason: "limit" as const } : {}),
    };
  });
}

export function registerNotificationListeners(callbacks: NotificationListenerCallbacks): () => void {
  if (!isNativePlatform()) {
    if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
    const scheduler = browserScheduler();
    const unsubscribe = scheduler.subscribe((reminder) => {
      callbacks.onReceived?.({ reminderId: reminder.reminderId, body: reminder.body });
    });
    const wake = () => scheduler.wake();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }
  let disposed = false;
  const cleanups: Array<() => Promise<void>> = [];
  async function keep(handle: { remove: () => Promise<void> }) {
    if (disposed) await handle.remove();
    else cleanups.push(() => handle.remove());
  }
  void (async () => {
    const plugin = await nativePlugin();
    if (disposed) return;
    await keep(await plugin.addListener("localNotificationActionPerformed", (event) => {
      if (disposed || !isOurs(event.notification)) return;
      const reminderId = extra(event.notification).reminderId;
      if (typeof reminderId === "string" && !isTest(event.notification)) callbacks.onAction(reminderId);
    }));
    if (disposed) return;
    await keep(await plugin.addListener("localNotificationReceived", (notification) => {
      if (disposed || !isOurs(notification)) return;
      const reminderId = extra(notification).reminderId;
      callbacks.onReceived?.({ reminderId: typeof reminderId === "string" ? reminderId : undefined, body: notification.body ?? "" });
    }));
  })().catch(() => {
    // Permission/schedule operations report their errors in the UI. A listener
    // failing to attach must not generate an unhandled rejection at startup.
    for (const cleanup of cleanups.splice(0)) void cleanup().catch(() => undefined);
  });
  return () => {
    disposed = true;
    for (const cleanup of cleanups.splice(0)) void cleanup().catch(() => undefined);
  };
}
