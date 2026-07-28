import { describe, expect, it } from "vitest";
import { createNotificationId, normalizeNotificationId } from "./notificationIds";

describe("notificationIds", () => {
  it("normaliza identificadores numéricos existentes", () => {
    expect(normalizeNotificationId(184527)).toBe(184527);
    expect(normalizeNotificationId("184527")).toBe(184527);
  });

  it("gera um novo identificador inteiro para valores legados", () => {
    const id = normalizeNotificationId("uuid-antigo");
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeGreaterThan(0);
  });

  it("incrementa identificadores novos", () => {
    const storage = new Map<string, string>();
    const originalGetItem = globalThis.localStorage?.getItem.bind(globalThis.localStorage);
    const originalSetItem = globalThis.localStorage?.setItem.bind(globalThis.localStorage);

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    const first = createNotificationId();
    const second = createNotificationId();
    expect(second).toBe(first + 1);

    if (originalGetItem && originalSetItem) {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
          getItem: originalGetItem,
          setItem: originalSetItem,
        },
      });
    }
  });
});
