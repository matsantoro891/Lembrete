import { NextRequest } from "next/server";

const ALERTAS_PERMITIDOS = new Set([0, 10, 30, 60, 1440]);

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function alarmTrigger(minutes: number): string {
  if (minutes === 0) return "PT0M";
  if (minutes === 1440) return "-P1D";
  if (minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

function foldLine(line: string): string {
  const pieces: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = Buffer.byteLength(char, "utf8");
    const limit = pieces.length === 0 ? 75 : 74;

    if (current && currentBytes + charBytes > limit) {
      pieces.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  if (current) pieces.push(current);
  return pieces.map((piece, index) => (index === 0 ? piece : ` ${piece}`)).join("\r\n");
}

function badRequest(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const texto = (request.nextUrl.searchParams.get("texto") ?? "").trim();
  const inicioIso = request.nextUrl.searchParams.get("inicio") ?? "";
  const aviso = Number(request.nextUrl.searchParams.get("aviso"));

  if (!texto) return badRequest("Informe o texto do lembrete.");
  if (texto.length > 500) return badRequest("O texto deve ter no máximo 500 caracteres.");
  if (!ALERTAS_PERMITIDOS.has(aviso)) return badRequest("Antecedência do alerta inválida.");

  const inicio = new Date(inicioIso);
  if (Number.isNaN(inicio.getTime())) return badRequest("Data ou horário inválido.");

  const fim = new Date(inicio.getTime() + 30 * 60 * 1000);
  const agora = new Date();
  const uid = `${crypto.randomUUID()}@lembrete-ms`;
  const descricao = "Lembrete criado pelo Lembrete MS";

  const rawLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lembrete MS//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(agora)}`,
    `DTSTART:${formatUtc(inicio)}`,
    `DTEND:${formatUtc(fim)}`,
    `SUMMARY:${escapeIcsText(texto)}`,
    `DESCRIPTION:${escapeIcsText(descricao)}`,
    "BEGIN:VALARM",
    `TRIGGER:${alarmTrigger(aviso)}`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(texto)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const calendar = `${rawLines.map(foldLine).join("\r\n")}\r\n`;

  return new Response(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lembrete.ics"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
