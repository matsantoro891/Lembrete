import { Capacitor, registerPlugin } from "@capacitor/core";
import { isAllowedAlertMinutes } from "./alertOptions";

export type AppleReminderInput = {
  id: string;
  text: string;
  startsAt: string;
  alertMinutes: number;
  notifyAt: string | null;
  appleReminderId?: string;
};

export type AppleReminderLink = Pick<AppleReminderInput, "id" | "appleReminderId">;

export type AppleReminderSaveResult = {
  identifier: string;
  created: boolean;
  alarmScheduled: boolean;
};

type AppleRemindersPlugin = {
  openCalendar(options: {
    title: string;
    startsAt: string;
    alertMinutes: number;
  }): Promise<{ saved: boolean; cancelled: boolean }>;
  save(options: {
    reminderId: string;
    title: string;
    startsAt: string;
    alertMinutes: number;
    notifyAt: string | null;
    identifier?: string;
  }): Promise<AppleReminderSaveResult>;
  complete(options: {
    reminderId: string;
    identifier?: string;
  }): Promise<{ completed: boolean; missing?: boolean }>;
  remove(options: {
    reminderId: string;
    identifier?: string;
  }): Promise<{ removed: boolean; missing?: boolean }>;
};

const AppleReminders = registerPlugin<AppleRemindersPlugin>("AppleReminders");

export function isAppleRemindersAvailable(): boolean {
  return Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("AppleReminders");
}

function requireAppleReminders(): void {
  if (!isAppleRemindersAvailable()) {
    throw new Error(
      "Salvar diretamente no Lembretes do iPhone requer a versão nativa atualizada do Lembrete MS.",
    );
  }
}

function validateReminderId(id: string): void {
  if (!id || id.length > 128) throw new Error("Identificador do lembrete inválido.");
}

/** Saves through EventKit; resolves only after iOS confirms the database write. */
export async function saveAppleReminder(
  reminder: AppleReminderInput,
): Promise<AppleReminderSaveResult> {
  requireAppleReminders();
  validateReminderId(reminder.id);
  const title = reminder.text.trim();
  const startsAt = new Date(reminder.startsAt);
  if (!title || title.length > 500) throw new Error("Informe um lembrete com até 500 caracteres.");
  if (!Number.isFinite(startsAt.getTime()) || !isAllowedAlertMinutes(reminder.alertMinutes)) {
    throw new Error("A data, o horário ou a antecedência do lembrete é inválida.");
  }

  let notifyAt: string | null = null;
  if (reminder.notifyAt !== null) {
    const alarm = new Date(reminder.notifyAt);
    const expectedAlarm = startsAt.getTime() - reminder.alertMinutes * 60_000;
    if (!Number.isFinite(alarm.getTime()) || Math.abs(alarm.getTime() - expectedAlarm) > 1_000) {
      throw new Error("O horário do alerta não corresponde à antecedência escolhida.");
    }
    notifyAt = alarm.toISOString();
  }

  return AppleReminders.save({
    reminderId: reminder.id,
    title,
    startsAt: startsAt.toISOString(),
    alertMinutes: reminder.alertMinutes,
    notifyAt,
    identifier: reminder.appleReminderId,
  });
}

/** Only the native registry's link may be used; arbitrary Apple IDs are never trusted. */
export async function completeAppleReminder(reminder: AppleReminderLink) {
  requireAppleReminders();
  validateReminderId(reminder.id);
  return AppleReminders.complete({ reminderId: reminder.id, identifier: reminder.appleReminderId });
}

export async function removeAppleReminder(reminder: AppleReminderLink) {
  requireAppleReminders();
  validateReminderId(reminder.id);
  return AppleReminders.remove({ reminderId: reminder.id, identifier: reminder.appleReminderId });
}

/** Presents Apple's event editor; the person confirms Add or Cancel. */
export async function openAppleCalendarEvent(
  reminder: Pick<AppleReminderInput, "text" | "startsAt" | "alertMinutes">,
) {
  requireAppleReminders();
  const title = reminder.text.trim();
  const startsAt = new Date(reminder.startsAt);
  if (!title || title.length > 500 || !Number.isFinite(startsAt.getTime()) ||
      !isAllowedAlertMinutes(reminder.alertMinutes)) {
    throw new Error("Confira o texto, a data, o horário e a antecedência do compromisso.");
  }
  return AppleReminders.openCalendar({
    title,
    startsAt: startsAt.toISOString(),
    alertMinutes: reminder.alertMinutes,
  });
}
