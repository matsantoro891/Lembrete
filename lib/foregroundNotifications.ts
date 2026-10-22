export type ForegroundReminder = {
  notificationId: number;
  body: string;
  notifyAt: string;
  reminderId: string;
};

type Environment = {
  now: () => number;
  isVisible: () => boolean;
  setTimer: (callback: () => void, delay: number) => unknown;
  clearTimer: (timer: unknown) => void;
  wasDelivered?: (key: string) => boolean;
  markDelivered?: (key: string) => void;
};

export const MAX_TIMER_DELAY = 2_147_483_647;
// Old reminders must not replay when a suspended tab is opened hours later.
export const FOREGROUND_ALERT_GRACE_MS = 60_000;

export class ForegroundNotificationScheduler {
  private reminders = new Map<number, ForegroundReminder>();
  private delivered = new Set<string>();
  private listeners = new Set<(reminder: ForegroundReminder) => void>();
  private timer: unknown;

  constructor(private environment: Environment) {}

  subscribe(listener: (reminder: ForegroundReminder) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  schedule(reminder: ForegroundReminder): boolean {
    const dueAt = new Date(reminder.notifyAt).getTime();
    this.reminders.delete(reminder.notificationId);
    if (!Number.isFinite(dueAt) || dueAt <= this.environment.now()) {
      this.arm();
      return false;
    }
    this.reminders.set(reminder.notificationId, { ...reminder });
    this.arm();
    return true;
  }

  sync(reminders: ForegroundReminder[], preserveIds: number[] = []): number {
    const preserved = [...this.reminders.values()].filter((reminder) => preserveIds.includes(reminder.notificationId));
    this.reminders.clear();
    const now = this.environment.now();
    for (const reminder of [...preserved, ...reminders]) {
      const dueAt = new Date(reminder.notifyAt).getTime();
      if (Number.isFinite(dueAt) && dueAt > now) {
        this.reminders.set(reminder.notificationId, { ...reminder });
      }
    }
    this.arm();
    return reminders.filter((reminder) => this.reminders.has(reminder.notificationId)).length;
  }

  cancel(notificationId: number): void {
    this.reminders.delete(notificationId);
    this.arm();
  }

  cancelAll(): void {
    this.reminders.clear();
    if (this.timer !== undefined) this.environment.clearTimer(this.timer);
    this.timer = undefined;
  }

  wake(): void {
    const now = this.environment.now();
    if (this.environment.isVisible()) {
      const due = [...this.reminders.values()].sort(
        (a, b) => new Date(a.notifyAt).getTime() - new Date(b.notifyAt).getTime(),
      );
      for (const reminder of due) {
        const dueAt = new Date(reminder.notifyAt).getTime();
        if (dueAt > now) continue;
        this.reminders.delete(reminder.notificationId);
        const key = `${reminder.reminderId}:${reminder.notifyAt}`;
        if (
          now - dueAt > FOREGROUND_ALERT_GRACE_MS ||
          this.delivered.has(key) ||
          this.environment.wasDelivered?.(key)
        ) continue;
        this.delivered.add(key);
        this.environment.markDelivered?.(key);
        for (const listener of this.listeners) listener(reminder);
      }
    }
    this.arm();
  }

  private arm(): void {
    if (this.timer !== undefined) this.environment.clearTimer(this.timer);
    this.timer = undefined;
    const now = this.environment.now();
    // Hidden overdue entries are reconsidered on focus/visibilitychange.
    const futureTimes = [...this.reminders.values()]
      .map((reminder) => new Date(reminder.notifyAt).getTime())
      .filter((at) => at > now || this.environment.isVisible());
    if (!futureTimes.length) return;
    this.timer = this.environment.setTimer(
      () => this.wake(),
      Math.min(MAX_TIMER_DELAY, Math.max(1, Math.min(...futureTimes) - now)),
    );
  }
}
