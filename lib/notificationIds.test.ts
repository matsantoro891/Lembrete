import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotificationId, getTestNotificationId, normalizeNotificationId } from "./notificationIds";

afterEach(() => vi.unstubAllGlobals());

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

  it("substitui ids fora do inteiro de 32 bits e o id reservado para teste", () => {
    for (const value of [-1, 0, 1.5, Infinity, 2_147_483_648, "2147483648", getTestNotificationId()]) {
      const id = normalizeNotificationId(value);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(2_147_483_647);
      expect(id).not.toBe(getTestNotificationId());
    }
  });

  it("não produz NaN nem reutiliza ids quando o armazenamento está indisponível", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } });
    const first = createNotificationId();
    const second = createNotificationId();
    expect(Number.isInteger(first)).toBe(true);
    expect(second).toBe(first + 1);
  });

  it("pula o id de teste ao incrementar o contador", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => String(getTestNotificationId() - 1), setItem: vi.fn() } });
    expect(createNotificationId()).not.toBe(getTestNotificationId());
  });
});
