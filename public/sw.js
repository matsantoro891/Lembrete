const DB_NAME = "lembrete-ms-notifications-v1";
const STORE_NAME = "scheduled";
const MAX_TIMEOUT_MS = 2147483647;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const timers = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await rescheduleStoredNotifications();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;

  if (data.type === "SCHEDULE") {
    event.waitUntil(scheduleNotification(data.payload));
    return;
  }

  if (data.type === "CANCEL") {
    event.waitUntil(cancelNotification(data.payload.notificationId));
    return;
  }

  if (data.type === "SYNC_ALL") {
    event.waitUntil(syncAllNotifications(data.payload.reminders));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow("/");
      }
    })(),
  );
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "notificationId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllNotifications() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return dbRequest(store.getAll());
}

async function getNotification(notificationId) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return dbRequest(store.get(notificationId));
}

async function putNotification(entry) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await dbRequest(store.put(entry));
}

async function deleteNotification(notificationId) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await dbRequest(store.delete(notificationId));
}

async function clearNotifications() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await dbRequest(store.clear());
}

function clearTimer(notificationId) {
  const timer = timers.get(notificationId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(notificationId);
  }
}

function clearAllTimers() {
  for (const notificationId of timers.keys()) {
    clearTimer(notificationId);
  }
}

function armTimer(entry) {
  clearTimer(entry.notificationId);

  const delay = new Date(entry.notifyAt).getTime() - Date.now();
  if (delay <= 0) {
    return;
  }

  const timeoutId = setTimeout(() => {
    timers.delete(entry.notificationId);
    fireNotification(entry.notificationId).catch(() => undefined);
  }, Math.min(delay, MAX_TIMEOUT_MS));

  timers.set(entry.notificationId, timeoutId);
}

async function fireNotification(notificationId) {
  const entry = await getNotification(notificationId);
  if (!entry) return;

  const delay = new Date(entry.notifyAt).getTime() - Date.now();
  if (delay > 1000) {
    armTimer(entry);
    return;
  }

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fireNotification(notificationId);
  }

  await self.registration.showNotification(entry.title, {
    body: "Lembrete MS",
    tag: entry.notificationId,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { notificationId: entry.notificationId },
  });

  await deleteNotification(notificationId);
  clearTimer(notificationId);
}

async function scheduleNotification(payload) {
  const notifyAtMs = new Date(payload.notifyAt).getTime();
  if (Number.isNaN(notifyAtMs) || notifyAtMs <= Date.now()) {
    await cancelNotification(payload.notificationId);
    return;
  }

  const entry = {
    notificationId: payload.notificationId,
    title: payload.title,
    notifyAt: payload.notifyAt,
  };

  await putNotification(entry);
  armTimer(entry);
}

async function cancelNotification(notificationId) {
  clearTimer(notificationId);
  await deleteNotification(notificationId);
}

async function syncAllNotifications(reminders) {
  clearAllTimers();
  await clearNotifications();

  const now = Date.now();
  for (const reminder of reminders) {
    const notifyAtMs = new Date(reminder.notifyAt).getTime();
    if (Number.isNaN(notifyAtMs) || notifyAtMs <= now) continue;
    await scheduleNotification(reminder);
  }
}

async function rescheduleStoredNotifications() {
  clearAllTimers();
  const entries = await getAllNotifications();
  const now = Date.now();

  for (const entry of entries) {
    const notifyAtMs = new Date(entry.notifyAt).getTime();
    if (Number.isNaN(notifyAtMs) || notifyAtMs <= now) {
      await deleteNotification(entry.notificationId);
      continue;
    }

    armTimer(entry);
  }
}
