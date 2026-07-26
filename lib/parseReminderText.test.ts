import { describe, expect, it } from "vitest";
import { parseReminderText } from "./parseReminderText";

/** Domingo, 26 de julho de 2026, 15:00 */
const REF = new Date(2026, 6, 26, 15, 0, 0, 0);

describe("parseReminderText", () => {
  it("interpreta consulta dia 12 de dezembro às 8h00 da manhã", () => {
    const result = parseReminderText(
      "Consulta dia 12 de dezembro às 8h00 da manhã",
      REF,
    );

    expect(result).toMatchObject({
      description: "Consulta",
      date: "2026-12-12",
      time: "08:00",
      alertMinutes: 10,
    });
  });

  it("interpreta consulta 12 de dezembro às 8 horas", () => {
    const result = parseReminderText("Consulta 12 de dezembro às 8 horas", REF);

    expect(result.description).toBe("Consulta");
    expect(result.date).toBe("2026-12-12");
    expect(result.time).toBe("08:00");
  });

  it("interpreta dentista dia 10 de novembro às 14h30", () => {
    const result = parseReminderText(
      "Dentista dia 10 de novembro às 14h30",
      REF,
    );

    expect(result.description).toBe("Dentista");
    expect(result.date).toBe("2026-11-10");
    expect(result.time).toBe("14:30");
  });

  it("interpreta reunião dia 5 de janeiro sem horário", () => {
    const result = parseReminderText("Reunião dia 5 de janeiro", REF);

    expect(result.description).toBe("Reunião");
    expect(result.date).toBe("2027-01-05");
    expect(result.time).toBeNull();
  });

  it("usa hoje quando o horário ainda não passou", () => {
    const morning = new Date(2026, 6, 26, 8, 0, 0, 0);
    const result = parseReminderText("Ligar para Maria às 9 horas", morning);

    expect(result.description).toBe("Ligar para Maria");
    expect(result.date).toBe("2026-07-26");
    expect(result.time).toBe("09:00");
  });

  it("usa amanhã quando o horário já passou", () => {
    const evening = new Date(2026, 6, 26, 10, 0, 0, 0);
    const result = parseReminderText("Ligar para Maria às 9 horas", evening);

    expect(result.description).toBe("Ligar para Maria");
    expect(result.date).toBe("2026-07-27");
    expect(result.time).toBe("09:00");
  });

  it("interpreta consulta com dia, mês e horário", () => {
    const result = parseReminderText(
      "Consulta dia 10 de novembro às 8 horas",
      REF,
    );

    expect(result.description).toBe("Consulta");
    expect(result.date).toBe("2026-11-10");
    expect(result.time).toBe("08:00");
    expect(result.alertMinutes).toBe(10);
  });

  it("interpreta dentista amanhã com horário compacto", () => {
    const result = parseReminderText("Dentista amanhã às 14h30", REF);

    expect(result.description).toBe("Dentista");
    expect(result.date).toBe("2026-07-27");
    expect(result.time).toBe("14:30");
  });

  it("interpreta reunião na próxima sexta à tarde", () => {
    const result = parseReminderText(
      "Reunião sexta-feira às três da tarde",
      REF,
    );

    expect(result.description).toBe("Reunião");
    expect(result.date).toBe("2026-07-31");
    expect(result.time).toBe("15:00");
  });

  it("interpreta comprar pão hoje à noite", () => {
    const result = parseReminderText(
      "Comprar pão hoje às oito da noite",
      REF,
    );

    expect(result.description).toBe("Comprar pão");
    expect(result.date).toBe("2026-07-26");
    expect(result.time).toBe("20:00");
  });

  it("reconhece variações sem a preposição de", () => {
    const result = parseReminderText("Consulta dia 12 dezembro às 8 horas", REF);

    expect(result.description).toBe("Consulta");
    expect(result.date).toBe("2026-12-12");
    expect(result.time).toBe("08:00");
  });

  it("reconhece dia por extenso", () => {
    const result = parseReminderText(
      "Consulta dia doze de dezembro às 8 horas",
      REF,
    );

    expect(result.description).toBe("Consulta");
    expect(result.date).toBe("2026-12-12");
    expect(result.time).toBe("08:00");
  });

  it("reconhece data numérica 12/12", () => {
    const result = parseReminderText("Consulta 12/12 às 8 horas", REF);

    expect(result.date).toBe("2026-12-12");
    expect(result.time).toBe("08:00");
  });

  it("mantém só a descrição quando não há data nem horário", () => {
    const result = parseReminderText("Comprar presente", REF);

    expect(result.description).toBe("Comprar presente");
    expect(result.date).toBeNull();
    expect(result.time).toBeNull();
    expect(result.alertMinutes).toBe(10);
  });

  it("não aceita data inválida como 31 de fevereiro", () => {
    const result = parseReminderText(
      "Consulta dia 31 de fevereiro às 10 horas",
      REF,
    );

    expect(result.date).toBeNull();
    expect(result.time).toBe("10:00");
  });

  it("usa o próximo ano quando o dia/mês do ano atual já passou", () => {
    const afterDecember = new Date(2026, 11, 13, 12, 0, 0, 0);
    const result = parseReminderText(
      "Consulta dia 12 de dezembro às 8 horas",
      afterDecember,
    );

    expect(result.date).toBe("2027-12-12");
    expect(result.time).toBe("08:00");
  });
});
