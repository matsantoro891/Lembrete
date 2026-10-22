import { afterEach, describe, expect, it, vi } from "vitest";
import { reminderShareData, shareReminderToIPhone } from "./shareReminder";

const reminder = { text: "Consulta", startsAt: "2026-11-01T14:00:00-03:00", alertMinutes: 0 };
afterEach(() => vi.unstubAllGlobals());

describe("compartilhar com Lembretes no iPhone", () => {
  it("envia texto e data e não presume que o iPhone configurou um alarme", () => {
    const data = reminderShareData(reminder);
    expect(data.title).toBe("Consulta");
    expect(data.text).toContain("No momento do compromisso");
    expect(data.text).toContain("Confira a data e o alerta");
  });

  it("abre compartilhar imediatamente, dentro do gesto do usuário", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    const operation = shareReminderToIPhone(reminder);
    expect(share).toHaveBeenCalledTimes(1);
    expect(await operation).toBe("shared");
  });

  it("cancelamento não é confundido com salvamento no Apple Lembretes", async () => {
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new DOMException("Cancelado", "AbortError")) });
    expect(await shareReminderToIPhone(reminder)).toBe("cancelled");
  });

  it("não fabrica integração quando compartilhar não está disponível", async () => {
    vi.stubGlobal("navigator", {});
    expect(await shareReminderToIPhone(reminder)).toBe("unavailable");
  });
});
