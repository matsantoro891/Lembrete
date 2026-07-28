import { describe, expect, it } from "vitest";
import { normalizeNotificationId } from "./notificationIds";

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
});
