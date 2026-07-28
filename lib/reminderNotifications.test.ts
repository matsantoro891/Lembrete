import { describe, expect, it } from "vitest";
import {
  calculateNotificationDate,
  hasAlertMinutes,
  isNotificationInPast,
  PAST_ALERT_MESSAGE,
  resolveNotifyAt,
} from "./reminderNotifications";

describe("reminderNotifications", () => {
  const appointment = new Date("2026-11-10T08:00:00");

  it("aceita alertMinutes igual a zero", () => {
    expect(hasAlertMinutes(0)).toBe(true);
    expect(calculateNotificationDate(appointment, 0)).toEqual(new Date("2026-11-10T08:00:00"));
  });

  it("calcula antecedências em minutos e horas", () => {
    expect(calculateNotificationDate(appointment, 10)).toEqual(new Date("2026-11-10T07:50:00"));
    expect(calculateNotificationDate(appointment, 30)).toEqual(new Date("2026-11-10T07:30:00"));
    expect(calculateNotificationDate(appointment, 60)).toEqual(new Date("2026-11-10T07:00:00"));
  });

  it("calcula alerta de um dia antes no mesmo horário", () => {
    expect(calculateNotificationDate(appointment, 1440)).toEqual(new Date("2026-11-09T08:00:00"));
  });

  it("identifica horários de alerta já passados", () => {
    const notifyAt = new Date("2026-11-10T07:50:00");
    const now = new Date("2026-11-10T08:00:00");
    expect(isNotificationInPast(notifyAt, now)).toBe(true);
  });

  it("não agenda notificação retroativa", () => {
    const now = new Date("2026-11-10T08:00:00");
    expect(resolveNotifyAt("2026-11-10T08:00:00", 10, now)).toBeNull();
    expect(resolveNotifyAt("2026-11-10T08:00:00", 0, now)).toBeNull();
  });

  it("expõe mensagem para alerta já passado", () => {
    expect(PAST_ALERT_MESSAGE).toContain("O horário selecionado para o alerta já passou.");
  });
});
