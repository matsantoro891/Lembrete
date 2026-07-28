const NOTIFICATION_ID_SEQ_KEY = "lembrete-ms-notification-id-seq";
const TEST_NOTIFICATION_ID = 999999;

export function createNotificationId(): number {
  if (typeof window === "undefined") return 100001;

  const stored = Number(window.localStorage.getItem(NOTIFICATION_ID_SEQ_KEY) ?? "100000");
  const next = stored >= 2147483000 ? 100001 : stored + 1;
  window.localStorage.setItem(NOTIFICATION_ID_SEQ_KEY, String(next));
  return next;
}

export function normalizeNotificationId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return createNotificationId();
}

export function getTestNotificationId(): number {
  return TEST_NOTIFICATION_ID;
}
