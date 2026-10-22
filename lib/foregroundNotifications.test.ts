import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForegroundNotificationScheduler, MAX_TIMER_DELAY, type ForegroundReminder } from "./foregroundNotifications";

const start = new Date("2026-11-10T12:00:00.000Z");
function reminder(seconds = 10, id = 1): ForegroundReminder {
  return { notificationId: id, reminderId: String(id), body: "Consulta", notifyAt: new Date(start.getTime() + seconds * 1000).toISOString() };
}
function setup(history = new Set<string>()) {
  let visible = true;
  const setTimer = vi.fn((callback: () => void, delay: number) => setTimeout(callback, delay));
  const scheduler = new ForegroundNotificationScheduler({
    now: () => Date.now(),
    isVisible: () => visible,
    setTimer,
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    wasDelivered: (key) => history.has(key),
    markDelivered: (key) => { history.add(key); },
  });
  const receive = vi.fn();
  scheduler.subscribe(receive);
  return { scheduler, receive, setTimer, visible: (next: boolean) => { visible = next; } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("foreground notifications", () => {
  it("fires at the chosen instant only once while visible", () => {
    const { scheduler, receive } = setup();
    expect(scheduler.schedule(reminder())).toBe(true);
    vi.advanceTimersByTime(9999);
    expect(receive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(receive).toHaveBeenCalledOnce();
    scheduler.wake();
    expect(receive).toHaveBeenCalledOnce();
  });

  it("replaces an edited schedule and cancels completion/deletion", () => {
    const { scheduler, receive } = setup();
    scheduler.schedule(reminder(10));
    scheduler.schedule({ ...reminder(20), body: "Consulta alterada" });
    vi.advanceTimersByTime(10000);
    expect(receive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ body: "Consulta alterada" }));
    scheduler.schedule(reminder(30, 2));
    scheduler.cancel(2);
    vi.advanceTimersByTime(10000);
    expect(receive).toHaveBeenCalledOnce();
  });

  it("clears all timers when notifications are disabled", () => {
    const { scheduler, receive } = setup();
    scheduler.sync([reminder(10), reminder(20, 2)]);
    scheduler.cancelAll();
    vi.advanceTimersByTime(30000);
    expect(receive).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not show alerts while hidden and discards old missed alerts on resume", () => {
    const { scheduler, receive, visible } = setup();
    scheduler.schedule(reminder());
    visible(false);
    vi.advanceTimersByTime(10000);
    expect(receive).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3600000);
    visible(true);
    scheduler.wake();
    expect(receive).not.toHaveBeenCalled();
  });

  it("shows a recently due alert when focus returns within the grace period", () => {
    const { scheduler, receive, visible } = setup();
    scheduler.schedule(reminder());
    visible(false);
    vi.advanceTimersByTime(15000);
    visible(true);
    scheduler.wake();
    expect(receive).toHaveBeenCalledOnce();
  });

  it("chunks dates more than 24.8 days away instead of overflowing a timer", () => {
    const { scheduler, receive, setTimer } = setup();
    const seconds = (MAX_TIMER_DELAY + 10000) / 1000;
    scheduler.schedule(reminder(seconds));
    expect(setTimer.mock.calls[0][1]).toBe(MAX_TIMER_DELAY);
    vi.advanceTimersByTime(MAX_TIMER_DELAY);
    expect(receive).not.toHaveBeenCalled();
    expect(setTimer.mock.calls[1][1]).toBe(10000);
    vi.advanceTimersByTime(10000);
    expect(receive).toHaveBeenCalledOnce();
  });

  it("deduplicates deliveries across schedulers sharing browser history", () => {
    const history = new Set<string>();
    const first = setup(history);
    const second = setup(history);
    first.scheduler.schedule(reminder());
    second.scheduler.schedule(reminder());
    vi.advanceTimersByTime(10000);
    expect(first.receive.mock.calls.length + second.receive.mock.calls.length).toBe(1);
  });

  it("never arms invalid or already elapsed dates", () => {
    const { scheduler, receive } = setup();
    expect(scheduler.schedule(reminder(-1))).toBe(false);
    expect(scheduler.schedule({ ...reminder(), notifyAt: "invalid" })).toBe(false);
    scheduler.wake();
    expect(receive).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
