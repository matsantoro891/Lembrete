import { DEFAULT_ALERT_MINUTES, isAllowedAlertMinutes } from "./alertOptions";
import { createNotificationId } from "./notificationIds";
import { buildSchedulableReminder, resolveNotifyAt, type SchedulableReminder } from "./reminderNotifications";

export type Reminder = SchedulableReminder & {
  createdAt: string;
  appleReminderId?: string;
};

export const STORAGE_KEY = "lembrete-voz-reminders-v1";

function createReminderId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Some WebViews/custom schemes expose getRandomValues without randomUUID.
  // Keep native/offline saving independent of that optional convenience API.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function readReminders(storage: Pick<Storage, "getItem">): Reminder[] {
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) return [];
  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) throw new Error("Formato de lembretes inválido.");

  return parsed.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Lembrete inválido.");
    const item = value as Partial<Reminder>;
    if (typeof item.id !== "string" || typeof item.text !== "string" ||
      typeof item.startsAt !== "string" || !Number.isFinite(Date.parse(item.startsAt))) {
      throw new Error("Lembrete inválido.");
    }
    const alertMinutes = isAllowedAlertMinutes(item.alertMinutes) ? item.alertMinutes : DEFAULT_ALERT_MINUTES;
    return {
      ...buildSchedulableReminder({
        id: item.id,
        text: item.text,
        startsAt: item.startsAt,
        alertMinutes,
        notificationId: item.notificationId,
        notifyAt: item.completed ? null : resolveNotifyAt(item.startsAt, alertMinutes),
        completed: item.completed === true,
      }),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      ...(typeof item.appleReminderId === "string" ? { appleReminderId: item.appleReminderId } : {}),
    };
  });
}

// Write before updating the UI or invoking permissions/external apps. A cancelled
// share sheet or denied system permission must never discard the local reminder.
export function writeReminders(storage: Pick<Storage, "setItem">, reminders: Reminder[]): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

export function upsertReminder(
  reminders: Reminder[],
  input: { text: string; startsAt: Date; alertMinutes: number; editingId: string | null },
): { reminder: Reminder; reminders: Reminder[]; updated: boolean } {
  const text = input.text.trim();
  if (!text || text.length > 500 || !Number.isFinite(input.startsAt.getTime()) ||
    !isAllowedAlertMinutes(input.alertMinutes)) throw new Error("Preencha texto, data, horário e alerta válidos.");
  const startsAt = input.startsAt.toISOString();
  const existing = input.editingId
    ? reminders.find((item) => item.id === input.editingId)
    : reminders.find((item) => item.text === text && item.startsAt === startsAt && !item.completed);

  const reminder: Reminder = {
    ...buildSchedulableReminder({
      id: existing?.id ?? createReminderId(),
      text,
      startsAt,
      alertMinutes: input.alertMinutes,
      notificationId: existing?.notificationId ?? createNotificationId(),
      notifyAt: resolveNotifyAt(startsAt, input.alertMinutes),
      completed: false,
    }),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    ...(existing?.appleReminderId ? { appleReminderId: existing.appleReminderId } : {}),
  };
  return {
    reminder,
    reminders: existing
      ? reminders.map((item) => item.id === existing.id ? reminder : item)
      : [...reminders, reminder],
    updated: Boolean(existing),
  };
}
