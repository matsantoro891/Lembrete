const NOTIFICATION_ID_SEQ_KEY = "lembrete-ms-notification-id-seq";
const TEST_NOTIFICATION_ID = 999999;
const MAX_NOTIFICATION_ID = 2_147_483_647;
let memorySequence = 100000;

function isValidReminderId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_NOTIFICATION_ID && value !== TEST_NOTIFICATION_ID;
}

export function createNotificationId(): number {
  let stored = memorySequence;
  try {
    if (typeof window !== "undefined") {
      const persisted = Number(window.localStorage.getItem(NOTIFICATION_ID_SEQ_KEY));
      if (isValidReminderId(persisted)) stored = Math.max(stored, persisted);
    }
  } catch {
    // An unavailable preference store must not block saving the reminder.
  }
  let next = stored >= MAX_NOTIFICATION_ID ? 100001 : stored + 1;
  if (next === TEST_NOTIFICATION_ID) next += 1;
  memorySequence = next;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NOTIFICATION_ID_SEQ_KEY, String(next));
    }
  } catch {
    // The caller reports persistence errors for the reminder itself.
  }
  return next;
}

export function normalizeNotificationId(value: unknown): number {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (isValidReminderId(numeric)) {
    memorySequence = Math.max(memorySequence, numeric);
    return numeric;
  }

  return createNotificationId();
}

export function getTestNotificationId(): number {
  return TEST_NOTIFICATION_ID;
}
