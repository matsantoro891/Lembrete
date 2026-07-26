export type ParsedReminder = {
  description: string;
  date: string | null;
  time: string | null;
  alertMinutes: number;
  confidence: {
    date: boolean;
    time: boolean;
  };
};

type MatchSpan = {
  start: number;
  end: number;
};

type DateHit = {
  date: Date | null;
  span: MatchSpan;
  invalid?: boolean;
};

type TimeHit = {
  hours: number;
  minutes: number;
  span: MatchSpan;
};

const DEFAULT_ALERT_MINUTES = 10;

const MONTH_NAMES =
  "janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  dezanove: 19,
  vinte: 20,
  "vinte e um": 21,
  "vinte e uma": 21,
  "vinte e dois": 22,
  "vinte e duas": 22,
  "vinte e tres": 23,
  "vinte e quatro": 24,
  "vinte e cinco": 25,
  "vinte e seis": 26,
  "vinte e sete": 27,
  "vinte e oito": 28,
  "vinte e nove": 29,
  trinta: 30,
  "trinta e um": 31,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Formata data local para input HTML (evita deslocamento UTC). */
export function formatLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTimeInput(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Normalização exclusiva para interpretação (acentos removidos). */
export function normalizeForParsing(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function preserveDisplayText(value: string): string {
  return value.replace(/[’']/g, "").replace(/\s+/g, " ").trim();
}

function isValidTime(hours: number, minutes: number): boolean {
  return (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function resolveExplicitDate(
  day: number,
  monthIndex: number,
  informedYear: number | undefined,
  referenceDate: Date,
): Date | null {
  let year = informedYear ?? referenceDate.getFullYear();

  let result = new Date(year, monthIndex, day, 12, 0, 0, 0);

  const validDate =
    result.getFullYear() === year &&
    result.getMonth() === monthIndex &&
    result.getDate() === day;

  if (!validDate) {
    return null;
  }

  if (!informedYear) {
    const today = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
    );
    const candidate = new Date(year, monthIndex, day);

    if (candidate < today) {
      year += 1;
      result = new Date(year, monthIndex, day, 12, 0, 0, 0);
    }
  }

  return result;
}

function nextWeekday(reference: Date, weekday: number, forceNextWeek = false): Date {
  const result = startOfDay(reference);
  const current = result.getDay();
  let delta = (weekday - current + 7) % 7;
  if (forceNextWeek && delta === 0) delta = 7;
  result.setDate(result.getDate() + delta);
  return result;
}

function parseNumberToken(token: string): number | null {
  const trimmed = normalizeForParsing(token);
  if (/^\d{1,4}$/.test(trimmed)) return Number(trimmed);
  return NUMBER_WORDS[trimmed] ?? null;
}

function expandSpan(text: string, start: number, end: number): MatchSpan {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart > 0 && /\s/.test(text[nextStart - 1] ?? "")) nextStart -= 1;
  while (nextEnd < text.length && /\s/.test(text[nextEnd] ?? "")) nextEnd += 1;
  return { start: nextStart, end: nextEnd };
}

function removeSpans(text: string, spans: MatchSpan[]): string {
  if (!spans.length) return text.trim();

  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const merged: MatchSpan[] = [];

  for (const span of ordered) {
    const last = merged[merged.length - 1];
    if (!last || span.start > last.end) merged.push({ ...span });
    else last.end = Math.max(last.end, span.end);
  }

  let result = "";
  let cursor = 0;
  for (const span of merged) {
    result += text.slice(cursor, span.start);
    result += " ";
    cursor = span.end;
  }
  result += text.slice(cursor);

  return result
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g, "")
    .trim();
}

function capitalizeDescription(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toLocaleUpperCase("pt-BR") + trimmed.slice(1);
}

function numberWordAlternation(): string {
  return Object.keys(NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/ /g, "\\s+"))
    .join("|");
}

function findExplicitDate(text: string, reference: Date): DateHit | null {
  const dayToken = `(?:\\d{1,2}|${numberWordAlternation()})`;

  const explicitDateRegex = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:dia\\s+)?(${dayToken})\\s*(?:de\\s+)?(${MONTH_NAMES})(?:\\s+de\\s+(\\d{2,4}))?(?![\\p{L}\\p{N}])`,
    "iu",
  );

  const namedMatch = explicitDateRegex.exec(text);
  if (namedMatch && namedMatch.index !== undefined) {
    const day = parseNumberToken(namedMatch[1]);
    const monthIndex = MONTHS[normalizeForParsing(namedMatch[2])];
    let informedYear: number | undefined;

    if (namedMatch[3]) {
      informedYear = Number(namedMatch[3]);
      if (informedYear < 100) informedYear += 2000;
    }

    if (day !== null && monthIndex !== undefined) {
      const span = expandSpan(text, namedMatch.index, namedMatch.index + namedMatch[0].length);
      const date = resolveExplicitDate(day, monthIndex, informedYear, reference);
      if (!date) return { date: null, span, invalid: true };
      return { date, span };
    }
  }

  const numeric =
    /(?<![\p{L}\p{N}])(?:dia\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\p{L}\p{N}])/iu;
  const numericMatch = numeric.exec(text);
  if (numericMatch && numericMatch.index !== undefined) {
    const day = Number(numericMatch[1]);
    const monthIndex = Number(numericMatch[2]) - 1;
    let informedYear: number | undefined;

    if (numericMatch[3]) {
      informedYear = Number(numericMatch[3]);
      if (informedYear < 100) informedYear += 2000;
    }

    const span = expandSpan(text, numericMatch.index, numericMatch.index + numericMatch[0].length);
    const date = resolveExplicitDate(day, monthIndex, informedYear, reference);
    if (!date) return { date: null, span, invalid: true };
    return { date, span };
  }

  const dayOnly = new RegExp(
    `(?<![\\p{L}\\p{N}])dia\\s+(${dayToken})(?![\\p{L}\\p{N}])`,
    "iu",
  );
  const dayOnlyMatch = dayOnly.exec(text);
  if (dayOnlyMatch && dayOnlyMatch.index !== undefined) {
    const day = parseNumberToken(dayOnlyMatch[1]);
    const span = expandSpan(text, dayOnlyMatch.index, dayOnlyMatch.index + dayOnlyMatch[0].length);

    if (day === null) return null;

    const ref = startOfDay(reference);
    let year = ref.getFullYear();
    let month = ref.getMonth();
    let candidate = new Date(year, month, day, 12, 0, 0, 0);

    const invalidThisMonth =
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month ||
      candidate.getDate() !== day;

    if (invalidThisMonth || candidate < ref) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      candidate = new Date(year, month, day, 12, 0, 0, 0);
    }

    const valid =
      candidate.getFullYear() === year &&
      candidate.getMonth() === month &&
      candidate.getDate() === day;

    if (!valid) return { date: null, span, invalid: true };
    return { date: candidate, span };
  }

  return null;
}

function findRelativeDate(text: string, reference: Date): DateHit | null {
  const patterns: Array<{ regex: RegExp; resolve: (match: RegExpMatchArray) => Date | null }> = [
    {
      regex: /(?<![\p{L}\p{N}])depois\s+de\s+amanha(?![\p{L}\p{N}])/iu,
      resolve: () => {
        const date = startOfDay(reference);
        date.setDate(date.getDate() + 2);
        return date;
      },
    },
    {
      regex: /(?<![\p{L}\p{N}])amanha(?![\p{L}\p{N}])/iu,
      resolve: () => {
        const date = startOfDay(reference);
        date.setDate(date.getDate() + 1);
        return date;
      },
    },
    {
      regex: /(?<![\p{L}\p{N}])hoje(?![\p{L}\p{N}])/iu,
      resolve: () => startOfDay(reference),
    },
    {
      regex: /(?<![\p{L}\p{N}])(?:daqui\s+(?:a\s+)?|em\s+)(\d{1,3}|[\p{L}]+)\s+dias?(?![\p{L}\p{N}])/iu,
      resolve: (match) => {
        const amount = parseNumberToken(match[1]);
        if (amount === null || amount < 0) return null;
        const date = startOfDay(reference);
        date.setDate(date.getDate() + amount);
        return date;
      },
    },
    {
      regex: /(?<![\p{L}\p{N}])daqui\s+(?:a\s+)?(uma|[\p{L}]+|\d{1,2})\s+semanas?(?![\p{L}\p{N}])/iu,
      resolve: (match) => {
        const amount = parseNumberToken(match[1]);
        if (amount === null || amount < 1) return null;
        const date = startOfDay(reference);
        date.setDate(date.getDate() + amount * 7);
        return date;
      },
    },
    {
      regex: /(?<![\p{L}\p{N}])no\s+proximo\s+mes(?![\p{L}\p{N}])/iu,
      resolve: () => {
        const date = startOfDay(reference);
        date.setMonth(date.getMonth() + 1, 1);
        return date;
      },
    },
    {
      regex:
        /(?<![\p{L}\p{N}])((?:proxima?\s+)?)(domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)(?![\p{L}\p{N}])/iu,
      resolve: (match) => {
        const forceNext = Boolean(match[1]?.trim());
        const weekday = WEEKDAYS[match[2]];
        if (weekday === undefined) return null;
        return nextWeekday(reference, weekday, forceNext);
      },
    },
  ];

  for (const pattern of patterns) {
    const match = pattern.regex.exec(text);
    if (!match || match.index === undefined) continue;
    const date = pattern.resolve(match);
    if (!date) continue;
    return {
      date,
      span: expandSpan(text, match.index, match.index + match[0].length),
    };
  }

  return null;
}

function applyPeriod(hours: number, period: string | undefined): number | null {
  if (!period) {
    return hours >= 0 && hours <= 23 ? hours : null;
  }

  if (period.includes("manha")) {
    if (hours === 12) return 0;
    if (hours >= 1 && hours <= 11) return hours;
    return null;
  }

  if (period.includes("tarde")) {
    if (hours === 12) return 12;
    if (hours >= 1 && hours <= 11) return hours + 12;
    return null;
  }

  if (period.includes("noite")) {
    if (hours === 12) return 0;
    if (hours >= 1 && hours <= 11) return hours + 12;
    return null;
  }

  return hours;
}

function findTime(text: string): TimeHit | null {
  const candidates: TimeHit[] = [];

  const push = (hours: number, minutes: number, start: number, end: number) => {
    if (!isValidTime(hours, minutes)) return;
    candidates.push({ hours, minutes, span: expandSpan(text, start, end) });
  };

  for (const match of text.matchAll(/(?<![\p{L}\p{N}])meio[-\s]?dia(?![\p{L}\p{N}])/giu)) {
    if (match.index === undefined) continue;
    push(12, 0, match.index, match.index + match[0].length);
  }

  for (const match of text.matchAll(/(?<![\p{L}\p{N}])meia[-\s]?noite(?![\p{L}\p{N}])/giu)) {
    if (match.index === undefined) continue;
    push(0, 0, match.index, match.index + match[0].length);
  }

  const halfWord =
    /(?<![\p{L}\p{N}])(?:as)\s+(\d{1,2}|[\p{L}]+)\s+e\s+meia(?:\s*(?:horas?)?)?(?:\s+da\s+(manha|tarde|noite))?(?![\p{L}\p{N}])/giu;

  for (const match of text.matchAll(halfWord)) {
    if (match.index === undefined) continue;
    const value = parseNumberToken(match[1]);
    if (value === null) continue;
    const hours = applyPeriod(value, match[2]);
    if (hours === null) continue;
    push(hours, 30, match.index, match.index + match[0].length);
  }

  const wordClock =
    /(?<![\p{L}\p{N}])(?:as)\s+((?:vinte|trinta)(?:\s+e\s+[\p{L}]+)?|[\p{L}]+)(?!\s+e\s+meia)(?:\s*(?:horas?)?)?(?:\s+da\s+(manha|tarde|noite))?(?![\p{L}\p{N}])/giu;

  for (const match of text.matchAll(wordClock)) {
    if (match.index === undefined) continue;
    const value = parseNumberToken(match[1]);
    if (value === null) continue;
    const hours = applyPeriod(value, match[2]);
    if (hours === null) continue;
    push(hours, 0, match.index, match.index + match[0].length);
  }

  const numericClock =
    /(?<![\p{L}\p{N}])(?:(?:as)\s*)?(\d{1,2})(?:[:hH](\d{2}))?(?:\s*(?:horas?|hrs?|hs?))?(?:\s+da\s+(manha|tarde|noite))?(?![\p{L}\p{N}])/giu;

  for (const match of text.matchAll(numericClock)) {
    if (match.index === undefined) continue;

    const before = text.slice(Math.max(0, match.index - 4), match.index);
    if (/dia\s*$/i.test(before)) continue;

    const raw = match[0];
    const hasCue =
      /\bas\b/i.test(raw) ||
      /hora|hrs?|hs?/i.test(raw) ||
      /[:hH]\d{2}/.test(raw) ||
      /da\s+(manha|tarde|noite)/i.test(raw);

    if (!hasCue) continue;

    const hoursRaw = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    const hours = applyPeriod(hoursRaw, match[3]);
    if (hours === null) continue;
    push(hours, minutes, match.index, match.index + match[0].length);
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const lengthDiff = b.span.end - b.span.start - (a.span.end - a.span.start);
    if (lengthDiff !== 0) return lengthDiff;
    return a.span.start - b.span.start;
  });

  return candidates[0];
}

function resolveDateForTimeOnly(
  reference: Date,
  hours: number,
  minutes: number,
): Date {
  const today = startOfDay(reference);
  const candidate = new Date(today);
  candidate.setHours(hours, minutes, 0, 0);

  if (candidate.getTime() > reference.getTime()) return today;

  const tomorrow = startOfDay(reference);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/**
 * Interpreta data e horário em português a partir de um texto de lembrete.
 * Determinístico e local — sem eval ou execução dinâmica.
 */
export function parseReminderText(
  text: string,
  referenceDate: Date = new Date(),
): ParsedReminder {
  const original = text.trim();
  const displayBase = preserveDisplayText(original);
  const normalized = normalizeForParsing(original);

  if (!normalized) {
    return {
      description: "",
      date: null,
      time: null,
      alertMinutes: DEFAULT_ALERT_MINUTES,
      confidence: { date: false, time: false },
    };
  }

  let explicitDateFound = false;
  let relativeDateFound = false;
  let timeFound = false;
  let invalidExplicitDate = false;

  let parsedDate: Date | null = null;
  let dateSpan: MatchSpan | null = null;
  let timeHit: TimeHit | null = null;

  // 1) Data explícita tem prioridade máxima.
  const explicit = findExplicitDate(normalized, referenceDate);
  if (explicit) {
    dateSpan = explicit.span;
    if (explicit.invalid || !explicit.date) {
      invalidExplicitDate = true;
    } else {
      explicitDateFound = true;
      parsedDate = explicit.date;
    }
  }

  // 2) Expressões relativas (hoje, amanhã, dias da semana…), se não houver data explícita.
  if (!explicitDateFound && !invalidExplicitDate) {
    const relative = findRelativeDate(normalized, referenceDate);
    if (relative?.date) {
      relativeDateFound = true;
      parsedDate = relative.date;
      dateSpan = relative.span;
    }
  }

  // 3) Horário.
  timeHit = findTime(normalized);
  if (timeHit) timeFound = true;

  // 4) Horário sem data → hoje/amanhã — somente se nenhuma data foi encontrada.
  if (timeFound && !explicitDateFound && !relativeDateFound && !invalidExplicitDate && timeHit) {
    parsedDate = resolveDateForTimeOnly(referenceDate, timeHit.hours, timeHit.minutes);
  }

  const spans: MatchSpan[] = [];
  if (dateSpan) spans.push(dateSpan);
  if (timeHit) spans.push(timeHit.span);

  // Limpeza da descrição: remove só trechos reconhecidos.
  // Índices do texto sem acento alinham com displayBase na maioria dos casos PT-BR.
  const descriptionSource =
    normalizeForParsing(displayBase).length === displayBase.length
      ? displayBase
      : normalized;

  let description: string;
  if (!explicitDateFound && !relativeDateFound && !timeFound && !invalidExplicitDate) {
    description = original;
  } else {
    description = capitalizeDescription(removeSpans(descriptionSource, spans));
    if (!description) description = original;
  }

  return {
    description,
    date: parsedDate ? formatLocalDateInput(parsedDate) : null,
    time: timeHit ? formatLocalTimeInput(timeHit.hours, timeHit.minutes) : null,
    alertMinutes: DEFAULT_ALERT_MINUTES,
    confidence: {
      date: explicitDateFound || relativeDateFound || (timeFound && Boolean(parsedDate)),
      time: timeFound,
    },
  };
}
