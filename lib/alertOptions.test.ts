import { describe, expect, it } from "vitest";
import { alarmTrigger, ALLOWED_ALERT_MINUTES, DEFAULT_ALERT_MINUTES } from "./alertOptions";

describe("alertOptions", () => {
  it("mantém 10 minutos como alerta padrão", () => {
    expect(DEFAULT_ALERT_MINUTES).toBe(10);
  });

  it("aceita alerta no momento do compromisso", () => {
    expect(ALLOWED_ALERT_MINUTES.has(0)).toBe(true);
    expect(alarmTrigger(0)).toBe("PT0M");
  });

  it("gera gatilhos negativos para antecedências", () => {
    expect(alarmTrigger(5)).toBe("-PT5M");
    expect(alarmTrigger(10)).toBe("-PT10M");
    expect(alarmTrigger(15)).toBe("-PT15M");
    expect(alarmTrigger(30)).toBe("-PT30M");
    expect(alarmTrigger(60)).toBe("-PT1H");
    expect(alarmTrigger(1440)).toBe("-P1D");
  });
});
