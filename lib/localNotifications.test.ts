import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalNotificationSchema, PendingLocalNotificationSchema } from "@capacitor/local-notifications";

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true),
  ios: vi.fn(() => true),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getPending: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  getDeliveredNotifications: vi.fn(),
  removeDeliveredNotifications: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock("./platform", () => ({
  isNativePlatform: mocks.native,
  isNativeIOS: mocks.ios,
  PERMISSION_DENIED_MESSAGE: "Permita notificações nos Ajustes do iPhone.",
}));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: mocks }));

import {
  cancelAllReminderNotifications,
  cancelReminderNotification,
  registerNotificationListeners,
  requestNotificationPermission,
  scheduleReminderNotification,
  scheduleTestNotification,
  syncReminderNotifications,
  type ReminderNotificationPayload,
} from "./localNotifications";

const now = new Date("2026-11-10T12:00:00.000Z");
function reminder(id = 1, minutes = 10): ReminderNotificationPayload {
  return { notificationId: id, reminderId: `r${id}`, body: "Consulta", notifyAt: new Date(now.getTime() + minutes * 60000).toISOString() };
}
function pending(payload: ReminderNotificationPayload): PendingLocalNotificationSchema {
  return { id: payload.notificationId, title: "Lembrete MS", body: payload.body, schedule: { at: new Date(payload.notifyAt) }, extra: { reminderId: payload.reminderId } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true);
  mocks.ios.mockReturnValue(true);
  mocks.checkPermissions.mockResolvedValue({ display: "granted" });
  mocks.requestPermissions.mockResolvedValue({ display: "granted" });
  mocks.getPending.mockResolvedValue({ notifications: [] });
  mocks.schedule.mockResolvedValue({ notifications: [] });
  mocks.cancel.mockResolvedValue(undefined);
  mocks.getDeliveredNotifications.mockResolvedValue({ notifications: [] });
  mocks.removeDeliveredNotifications.mockResolvedValue(undefined);
  mocks.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("native reminder notifications", () => {
  it("passes the exact UTC timestamp and stable id to the native scheduler", async () => {
    const item = reminder();
    await expect(scheduleReminderNotification(item)).resolves.toEqual({ mode: "native", scheduled: true });
    expect(mocks.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({ id: 1, body: "Consulta", schedule: { at: new Date(item.notifyAt), allowWhileIdle: true }, extra: expect.objectContaining({ reminderId: "r1", source: "lembrete-ms" }) })] });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("reports permission denial instead of pretending a notification was scheduled", async () => {
    mocks.checkPermissions.mockResolvedValue({ display: "denied" });
    await expect(scheduleReminderNotification(reminder())).resolves.toMatchObject({ scheduled: false, reason: "permission" });
    expect(mocks.schedule).not.toHaveBeenCalled();
    const permission = await requestNotificationPermission();
    expect(permission.status).toBe("denied");
    expect(permission.deniedMessage).toContain("Ajustes");
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });

  it("cancels the old request when an edit moves its alert into the past", async () => {
    await expect(scheduleReminderNotification(reminder(1, -5))).resolves.toMatchObject({ scheduled: false, reason: "past" });
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("reconciles edits and deletions without rescheduling unchanged reminders", async () => {
    const unchanged = reminder(1);
    const beforeEdit = reminder(2);
    const edited = { ...reminder(2, 20), body: "Consulta reagendada" };
    const unrelated = { id: 8, title: "Outro recurso", body: "Não tocar" };
    mocks.getPending.mockResolvedValue({ notifications: [pending(unchanged), pending(beforeEdit), pending(reminder(3)), unrelated] });
    const result = await syncReminderNotifications([unchanged, edited]);
    expect(result).toMatchObject({ scheduled: 2, deferred: 0 });
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 3 }] });
    expect(mocks.schedule.mock.calls[0][0].notifications).toEqual([expect.objectContaining({ id: 2, body: "Consulta reagendada" })]);
  });

  it("cancels an edited reminder's old time before a failed synchronization replacement", async () => {
    const old = pending(reminder(2));
    const unchanged = pending(reminder(1));
    let remaining = [unchanged, old];
    mocks.getPending.mockResolvedValue({ notifications: remaining });
    mocks.cancel.mockImplementation(async ({ notifications }: { notifications: { id: number }[] }) => {
      const ids = new Set(notifications.map((notification) => notification.id));
      remaining = remaining.filter((notification) => !ids.has(notification.id));
    });
    mocks.schedule.mockRejectedValueOnce(new Error("Falha no agendamento"));
    await expect(syncReminderNotifications([reminder(1), reminder(2, 20)])).rejects.toThrow("Falha no agendamento");
    expect(remaining.map((notification) => notification.id)).toEqual([1]);
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 2 }] });
    expect(mocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
  });

  it("cancels an edited reminder's old request before a failed direct replacement", async () => {
    mocks.getPending.mockResolvedValue({ notifications: [pending(reminder(1))] });
    mocks.schedule.mockRejectedValueOnce(new Error("Falha no agendamento"));
    await expect(scheduleReminderNotification({ ...reminder(1, 20), body: "Consulta alterada" })).rejects.toThrow("Falha no agendamento");
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
    expect(mocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
  });

  it("cancels pending and delivered app notifications when switched off", async () => {
    const owned = pending(reminder());
    const unrelated = { id: 9, title: "Outro recurso", body: "Não tocar" };
    mocks.getPending.mockResolvedValue({ notifications: [owned, unrelated] });
    mocks.getDeliveredNotifications.mockResolvedValue({ notifications: [owned, unrelated] });
    await cancelAllReminderNotifications();
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
    expect(mocks.removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [owned] });
  });

  it("removes the delivered card for a completed or deleted reminder", async () => {
    const owned = pending(reminder());
    mocks.getDeliveredNotifications.mockResolvedValue({ notifications: [owned] });
    await cancelReminderNotification(1);
    expect(mocks.removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [owned] });
  });

  it("reports the iOS limit and schedules the nearest reminders first", async () => {
    const items = Array.from({ length: 66 }, (_, index) => reminder(index + 1, index + 1)).reverse();
    const result = await syncReminderNotifications(items);
    expect(result).toMatchObject({ scheduled: 64, deferred: 2, reason: "limit", deferredReminderIds: ["r65", "r66"] });
    const scheduled = mocks.schedule.mock.calls[0][0].notifications as LocalNotificationSchema[];
    expect(scheduled).toHaveLength(64);
    expect(scheduled[0].id).toBe(1);
    expect(scheduled[63].id).toBe(64);
  });

  it("does not silently overwrite the oldest item when native capacity is full", async () => {
    mocks.getPending.mockResolvedValue({ notifications: Array.from({ length: 64 }, (_, index) => pending(reminder(index + 1))) });
    await expect(scheduleReminderNotification(reminder(65))).resolves.toMatchObject({ scheduled: false, reason: "limit" });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("serializes a delayed sync before switching notifications off", async () => {
    let finishSchedule!: () => void;
    const scheduled: PendingLocalNotificationSchema[] = [];
    mocks.getPending.mockImplementation(async () => ({ notifications: [...scheduled] }));
    mocks.schedule.mockImplementation(async (options: { notifications: LocalNotificationSchema[] }) => {
      await new Promise<void>((resolve) => { finishSchedule = resolve; });
      scheduled.push(...options.notifications);
    });
    mocks.cancel.mockImplementation(async () => { scheduled.length = 0; });
    const syncing = syncReminderNotifications([reminder()]);
    const disabling = cancelAllReminderNotifications();
    await vi.waitFor(() => expect(finishSchedule).toBeTypeOf("function"));
    finishSchedule();
    await Promise.all([syncing, disabling]);
    expect(scheduled).toHaveLength(0);
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
  });

  it("cleans up a listener that finishes attaching after disposal", async () => {
    let resolveListener!: (handle: { remove: () => Promise<void> }) => void;
    mocks.addListener.mockImplementationOnce(() => new Promise((resolve) => { resolveListener = resolve; }));
    const dispose = registerNotificationListeners({ onAction: vi.fn() });
    await vi.waitFor(() => expect(resolveListener).toBeTypeOf("function"));
    dispose();
    const remove = vi.fn().mockResolvedValue(undefined);
    resolveListener({ remove });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(mocks.addListener).toHaveBeenCalledTimes(1);
  });

  it("includes the test in app-owned cancellation and reports denied test scheduling", async () => {
    mocks.checkPermissions.mockResolvedValue({ display: "denied" });
    await expect(scheduleTestNotification(999999)).resolves.toMatchObject({ scheduled: false, reason: "permission" });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
