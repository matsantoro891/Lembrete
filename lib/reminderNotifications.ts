import { DEFAULT_ALERT_MINUTES } from "./alertOptions";
import { normalizeNotificationId } from "./notificationIds";

export const PAST_ALERT_MESSAGE =
  "O horário selecionado para o alerta já passou. O lembrete foi salvo, mas a notificação não foi programada.";

export type SchedulableReminder = {
  id: string;
  text: string;
  startsAt: string;
  alertMinutes: number;
  notificationId: number;
  notifyAt: string | null;
  completed: boolean;
};

export function hasAlertMinutes(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

export function calculateNotificationDate(
  appointmentDateTime: Date,
  alertMinutes: number | null | undefined,
): Date | null {
  if (!hasAlertMinutes(alertMinutes) || Number.isNaN(appointmentDateTime.getTime())) {
    return null;
  }

  return new Date(appointmentDateTime.getTime() - alertMinutes * 60 * 1000);
}

export function isNotificationInPast(notifyAt: Date, now: Date = new Date()): boolean {
  return notifyAt.getTime() <= now.getTime();
}

export function resolveNotifyAt(
  startsAt: string,
  alertMinutes: number | null | undefined,
  now: Date = new Date(),
): string | null {
  const appointmentDateTime = new Date(startsAt);
  const notifyAt = calculateNotificationDate(appointmentDateTime, alertMinutes);
  if (!notifyAt || isNotificationInPast(notifyAt, now)) return null;
  return notifyAt.toISOString();
}

export function buildSchedulableReminder(input: {
  id: string;
  text: string;
  startsAt: string;
  alertMinutes?: number | null;
  notificationId?: number | string;
  notifyAt?: string | null;
  completed?: boolean;
}): SchedulableReminder {
  const alertMinutes = hasAlertMinutes(input.alertMinutes)
    ? input.alertMinutes
    : DEFAULT_ALERT_MINUTES;

  const notificationId = normalizeNotificationId(input.notificationId);
  const notifyAt =
    input.notifyAt !== undefined
      ? input.notifyAt
      : resolveNotifyAt(input.startsAt, alertMinutes);

  return {
    id: input.id,
    text: input.text,
    startsAt: input.startsAt,
    alertMinutes,
    notificationId,
    notifyAt,
    completed: input.completed ?? false,
  };
}

export function toNotificationPayload(reminder: SchedulableReminder) {
  if (!reminder.notifyAt || reminder.completed) return null;
  if (isNotificationInPast(new Date(reminder.notifyAt))) return null;

  return {
    notificationId: reminder.notificationId,
    body: reminder.text,
    notifyAt: reminder.notifyAt,
    reminderId: reminder.id,
  };
}
