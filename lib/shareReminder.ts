import { ALERT_OPTIONS } from "./alertOptions";

type ShareableReminder = { text: string; startsAt: string; alertMinutes: number };
export type ShareReminderResult = "shared" | "cancelled" | "unavailable";

export function isAppleMobileWeb(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function reminderShareData(reminder: ShareableReminder): ShareData {
  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full", timeStyle: "short",
  }).format(new Date(reminder.startsAt));
  const alert = ALERT_OPTIONS.find((option) => option.value === reminder.alertMinutes)?.label;
  return {
    title: reminder.text,
    text: `${reminder.text}\n\nData e horário: ${date}\nAlerta: ${alert ?? "no horário escolhido"}\n\nCriado no Lembrete MS. Confira a data e o alerta no Lembretes do iPhone antes de adicionar.`,
  };
}

// Call directly from a user gesture, before awaiting notification permissions.
// Web Share does not identify the chosen app or confirm an Apple reminder save.
export async function shareReminderToIPhone(reminder: ShareableReminder): Promise<ShareReminderResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return "unavailable";
  const data = reminderShareData(reminder);
  if (navigator.canShare && !navigator.canShare(data)) return "unavailable";
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
    return "unavailable";
  }
}
