import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  save: vi.fn(),
  complete: vi.fn(),
  remove: vi.fn(),
  openCalendar: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: native,
  registerPlugin: () => ({
    save: native.save,
    complete: native.complete,
    remove: native.remove,
    openCalendar: native.openCalendar,
  }),
}));

import {
  completeAppleReminder,
  isAppleRemindersAvailable,
  openAppleCalendarEvent,
  removeAppleReminder,
  saveAppleReminder,
} from "./appleReminders";

const reminder = {
  id: "local-42",
  text: " Consulta ",
  startsAt: "2030-11-10T08:00:00-03:00",
  alertMinutes: 0,
  notifyAt: "2030-11-10T11:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  native.isNativePlatform.mockReturnValue(true);
  native.getPlatform.mockReturnValue("ios");
  native.isPluginAvailable.mockReturnValue(true);
  native.save.mockResolvedValue({ identifier: "apple-123", created: true, alarmScheduled: true });
});

describe("Apple Reminders adapter", () => {
  it("does not pretend EventKit exists in Safari, Android or an outdated native app", async () => {
    native.isNativePlatform.mockReturnValue(false);
    expect(isAppleRemindersAvailable()).toBe(false);
    await expect(saveAppleReminder(reminder)).rejects.toThrow("versão nativa atualizada");
    native.isNativePlatform.mockReturnValue(true);
    native.getPlatform.mockReturnValue("android");
    expect(isAppleRemindersAvailable()).toBe(false);
    native.getPlatform.mockReturnValue("ios");
    native.isPluginAvailable.mockReturnValue(false);
    expect(isAppleRemindersAvailable()).toBe(false);
    expect(native.save).not.toHaveBeenCalled();
  });

  it("keeps a zero-minute alarm and the exact instant across time zones", async () => {
    await expect(saveAppleReminder(reminder)).resolves.toEqual({
      identifier: "apple-123", created: true, alarmScheduled: true,
    });
    expect(native.save).toHaveBeenCalledWith({
      reminderId: "local-42",
      title: "Consulta",
      startsAt: "2030-11-10T11:00:00.000Z",
      alertMinutes: 0,
      notifyAt: "2030-11-10T11:00:00.000Z",
      identifier: undefined,
    });
  });

  it("passes an existing link when editing and replaces the selected alarm", async () => {
    await saveAppleReminder({
      ...reminder,
      alertMinutes: 10,
      notifyAt: "2030-11-10T10:50:00.000Z",
      appleReminderId: "apple-123",
    });
    expect(native.save).toHaveBeenCalledWith(expect.objectContaining({
      reminderId: "local-42", identifier: "apple-123",
      alertMinutes: 10, notifyAt: "2030-11-10T10:50:00.000Z",
    }));
  });

  it("keeps a missing/past alarm null while allowing the reminder to be saved", async () => {
    await saveAppleReminder({ ...reminder, notifyAt: null });
    expect(native.save).toHaveBeenCalledWith(expect.objectContaining({ notifyAt: null }));
  });

  it("rejects inconsistent dates or alert offsets before native writes", async () => {
    await expect(saveAppleReminder({ ...reminder, startsAt: "invalid" })).rejects.toThrow("inválida");
    await expect(saveAppleReminder({ ...reminder, alertMinutes: -5 })).rejects.toThrow("inválida");
    await expect(saveAppleReminder({ ...reminder, notifyAt: "2030-11-10T10:00:00.000Z" }))
      .rejects.toThrow("não corresponde");
    expect(native.save).not.toHaveBeenCalled();
  });

  it("propagates permission or save errors without reporting a false success", async () => {
    native.save.mockRejectedValue(new Error("O acesso aos Lembretes não foi autorizado."));
    await expect(saveAppleReminder(reminder)).rejects.toThrow("não foi autorizado");
  });

  it("sends the local ownership key with completion and removal", async () => {
    const link = { id: "local-42", appleReminderId: "apple-123" };
    await completeAppleReminder(link);
    await removeAppleReminder(link);
    expect(native.complete).toHaveBeenCalledWith({ reminderId: "local-42", identifier: "apple-123" });
    expect(native.remove).toHaveBeenCalledWith({ reminderId: "local-42", identifier: "apple-123" });
  });

  it("returns Calendar cancellation distinctly from a confirmed save", async () => {
    native.openCalendar.mockResolvedValue({ saved: false, cancelled: true });
    await expect(openAppleCalendarEvent(reminder)).resolves.toEqual({ saved: false, cancelled: true });
    expect(native.openCalendar).toHaveBeenCalledWith({
      title: "Consulta", startsAt: "2030-11-10T11:00:00.000Z", alertMinutes: 0,
    });
  });
});
