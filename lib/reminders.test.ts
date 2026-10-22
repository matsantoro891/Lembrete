import { afterEach, describe, expect, it, vi } from "vitest";
import { readReminders, STORAGE_KEY, upsertReminder, writeReminders } from "./reminders";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("salvamento persistente dos lembretes", () => {
  it("salva em WebViews sem crypto.randomUUID e produz identificadores distintos", () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    const input = { text: "Lembrete", startsAt: new Date("2099-11-01T14:00:00Z"), alertMinutes: 0, editingId: null };
    const first = upsertReminder([], input).reminder;
    const second = upsertReminder([], input).reminder;
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second.id).not.toBe(first.id);
  });

  it("migra registros antigos sem perder o alerta padrão e preserva vínculo Apple", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    const storage = { getItem: () => JSON.stringify([
      { id: "a", text: "Consulta", startsAt: "2026-11-01T14:00:00Z", appleReminderId: "apple-a" },
      { id: "b", text: "Ligar", startsAt: "2026-11-01T15:00:00Z", alertMinutes: 0 },
    ]) };
    const reminders = readReminders(storage);
    expect(reminders[0].notifyAt).toBe("2026-11-01T13:50:00.000Z");
    expect(reminders[0].appleReminderId).toBe("apple-a");
    expect(reminders[1].notifyAt).toBe("2026-11-01T15:00:00.000Z");
  });

  it("editar troca o horário e mantém os identificadores, sem duplicar ao salvar de novo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    const input = { text: "Consulta", startsAt: new Date("2026-11-01T14:00:00Z"), alertMinutes: 0, editingId: null };
    const first = upsertReminder([], input);
    first.reminder.appleReminderId = "apple-id";
    const edited = upsertReminder(first.reminders, { ...input, startsAt: new Date("2026-11-02T14:00:00Z"), alertMinutes: 60, editingId: first.reminder.id });
    const again = upsertReminder(edited.reminders, { ...input, startsAt: new Date("2026-11-02T14:00:00Z"), alertMinutes: 60 });
    expect(again.reminders).toHaveLength(1);
    expect(again.reminder).toMatchObject({ id: first.reminder.id, notificationId: first.reminder.notificationId, appleReminderId: "apple-id", notifyAt: "2026-11-02T13:00:00.000Z" });
  });

  it("falha de armazenamento é explícita, sem fingir salvamento", () => {
    const setItem = vi.fn(() => { throw new Error("QuotaExceededError"); });
    expect(() => writeReminders({ setItem }, [])).toThrow("QuotaExceededError");
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, "[]");
  });

  it("rejeita armazenamento corrompido sem sobrescrevê-lo", () => {
    expect(() => readReminders({ getItem: () => '{"broken":true}' })).toThrow();
    expect(() => readReminders({ getItem: () => '[{"id":"a"}]' })).toThrow();
  });
});
