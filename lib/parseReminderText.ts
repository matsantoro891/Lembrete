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

type DateParseResult = {
  date: Date | null;
  span: MatchSpan;
  invalid?: boolean;
};

type TimeParseResult = {
  hours: number;
  minutes: number;
  span: MatchSpan;
};

const DEFAULT_ALERT_MINUTES = 10;

/** Fronteira à esquerda compatível com letras acentuadas. */
const LB = "(?<![\\p{L}\\p{N}])";
/** Fronteira à direita compatível com letras acentuadas. */
const RB = "(?![\\p{L}\\p{N}])";

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  terça: 2,
  "terça-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
  sábado: 6,
};

const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  março: 2,
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

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
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
  "vinte e três": 23,
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

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeText(text: string): string {
  return text
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(text: string): string {
  return normalizeText(text).toLocaleLowerCase("pt-BR");
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month] ?? 0;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 0 || month > 11) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
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
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function createLocalDate(year: number, month: number, day: number): Date | null {
  if (!isValidDateParts(year, month, day)) return null;
  const result = new Date(year, month, day, 0, 0, 0, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month ||
    result.getDate() !== day
  ) {
    return null;
  }
  return result;
}

function nextOccurrenceOfMonthDay(
  reference: Date,
  month: number,
  day: number,
  year?: number,
): Date | null {
  if (year !== undefined) {
    return createLocalDate(year, month, day);
  }

  const ref = startOfDay(reference);
  let candidate = createLocalDate(ref.getFullYear(), month, day);
  if (!candidate) return null;

  if (candidate.getTime() < ref.getTime()) {
    candidate = createLocalDate(ref.getFullYear() + 1, month, day);
  }

  return candidate;
}

function nextWeekday(reference: Date, weekday: number, forceNextWeek = false): Date {
  const result = startOfDay(reference);
  const current = result.getDay();
  let delta = (weekday - current + 7) % 7;

  if (forceNextWeek && delta === 0) {
    delta = 7;
  }

  result.setDate(result.getDate() + delta);
  return result;
}

function parseNumberToken(token: string): number | null {
  const trimmed = token.trim().toLocaleLowerCase("pt-BR");
  if (/^\d{1,4}$/.test(trimmed)) return Number(trimmed);

  const direct = NUMBER_WORDS[trimmed] ?? NUMBER_WORDS[stripDiacritics(trimmed)];
  if (direct !== undefined) return direct;

  return null;
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
    if (!last || span.start > last.end) {
      merged.push({ ...span });
    } else {
      last.end = Math.max(last.end, span.end);
    }
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

function firstMatch(text: string, regex: RegExp): RegExpMatchArray | null {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const globalRegex = new RegExp(regex.source, flags);
  const match = globalRegex.exec(text);
  return match;
}

function allMatches(text: string, regex: RegExp): RegExpMatchArray[] {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return [...text.matchAll(new RegExp(regex.source, flags))];
}

function parseRelativeDate(text: string, reference: Date): DateParseResult | null {
  const patterns: Array<{ regex: RegExp; resolve: (match: RegExpMatchArray) => Date | null }> = [
    {
      regex: new RegExp(`${LB}depois\\s+de\\s+amanh[aã]${RB}`, "iu"),
      resolve: () => {
        const date = startOfDay(reference);
        date.setDate(date.getDate() + 2);
        return date;
      },
    },
    {
      regex: new RegExp(`${LB}amanh[aã]${RB}`, "iu"),
      resolve: () => {
        const date = startOfDay(reference);
        date.setDate(date.getDate() + 1);
        return date;
      },
    },
    {
      regex: new RegExp(`${LB}hoje${RB}`, "iu"),
      resolve: () => startOfDay(reference),
    },
    {
      regex: new RegExp(
        `${LB}(?:daqui\\s+(?:a\\s+)?|em\\s+)(\\d{1,3}|[\\p{L}]+)\\s+dias?${RB}`,
        "iu",
      ),
      resolve: (match) => {
        const amount = parseNumberToken(match[1]);
        if (amount === null || amount < 0) return null;
        const date = startOfDay(reference);
        date.setDate(date.getDate() + amount);
        return date;
      },
    },
    {
      regex: new RegExp(
        `${LB}daqui\\s+(?:a\\s+)?(uma|[\\p{L}]+|\\d{1,2})\\s+semanas?${RB}`,
        "iu",
      ),
      resolve: (match) => {
        const amount = parseNumberToken(match[1]);
        if (amount === null || amount < 1) return null;
        const date = startOfDay(reference);
        date.setDate(date.getDate() + amount * 7);
        return date;
      },
    },
    {
      regex: new RegExp(`${LB}no\\s+pr[oó]ximo\\s+m[eê]s${RB}`, "iu"),
      resolve: () => {
        const date = startOfDay(reference);
        date.setMonth(date.getMonth() + 1, 1);
        return date;
      },
    },
  ];

  for (const pattern of patterns) {
    const match = firstMatch(text, pattern.regex);
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

function parseWeekdayDate(text: string, reference: Date): DateParseResult | null {
  const regex = new RegExp(
    `${LB}((?:pr[oó]xima?\\s+)?)(domingo|segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado)${RB}`,
    "iu",
  );

  const match = firstMatch(text, regex);
  if (!match || match.index === undefined) return null;

  const forceNext = Boolean(match[1]?.trim());
  const raw = match[2].toLocaleLowerCase("pt-BR");
  const weekdayKey = stripDiacritics(raw);
  const weekday =
    WEEKDAYS[raw] ?? WEEKDAYS[weekdayKey] ?? WEEKDAYS[`${weekdayKey}-feira`];

  if (weekday === undefined) return null;

  return {
    date: nextWeekday(reference, weekday, forceNext),
    span: expandSpan(text, match.index, match.index + match[0].length),
  };
}

function parseExplicitDate(text: string, reference: Date): DateParseResult | null {
  const namedMonth = new RegExp(
    `${LB}(?:dia\\s+)?(\\d{1,2}|[\\p{L}]+)\\s+de\\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\\s+de\\s+(\\d{2,4}))?${RB}`,
    "iu",
  );

  const namedMatch = firstMatch(text, namedMonth);
  if (namedMatch && namedMatch.index !== undefined) {
    const day = parseNumberToken(namedMatch[1]);
    const monthName = namedMatch[2].toLocaleLowerCase("pt-BR");
    const month = MONTHS[monthName] ?? MONTHS[stripDiacritics(monthName)];
    let year: number | undefined;

    if (namedMatch[3]) {
      year = Number(namedMatch[3]);
      if (year < 100) year += 2000;
    }

    if (day !== null && month !== undefined) {
      const span = expandSpan(text, namedMatch.index, namedMatch.index + namedMatch[0].length);
      const date = nextOccurrenceOfMonthDay(reference, month, day, year);
      if (!date) {
        return { date: null, span, invalid: true };
      }
      return { date, span };
    }
  }

  const numeric = new RegExp(
    `${LB}(?:dia\\s+)?(\\d{1,2})[\\/-](\\d{1,2})(?:[\\/-](\\d{2,4}))?${RB}`,
    "iu",
  );
  const numericMatch = firstMatch(text, numeric);
  if (numericMatch && numericMatch.index !== undefined) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]) - 1;
    let year: number | undefined;

    if (numericMatch[3]) {
      year = Number(numericMatch[3]);
      if (year < 100) year += 2000;
    }

    const span = expandSpan(text, numericMatch.index, numericMatch.index + numericMatch[0].length);
    const date = nextOccurrenceOfMonthDay(reference, month, day, year);
    if (!date) {
      return { date: null, span, invalid: true };
    }
    return { date, span };
  }

  const dayOnly = new RegExp(`${LB}dia\\s+(\\d{1,2}|[\\p{L}]+)${RB}`, "iu");
  const dayOnlyMatch = firstMatch(text, dayOnly);
  if (dayOnlyMatch && dayOnlyMatch.index !== undefined) {
    const day = parseNumberToken(dayOnlyMatch[1]);
    if (day !== null) {
      const ref = startOfDay(reference);
      let candidate = createLocalDate(ref.getFullYear(), ref.getMonth(), day);

      if (!candidate || candidate.getTime() < ref.getTime()) {
        const nextMonth = ref.getMonth() === 11 ? 0 : ref.getMonth() + 1;
        const nextYear = ref.getMonth() === 11 ? ref.getFullYear() + 1 : ref.getFullYear();
        candidate = createLocalDate(nextYear, nextMonth, day);
      }

      if (candidate) {
        return {
          date: candidate,
          span: expandSpan(text, dayOnlyMatch.index, dayOnlyMatch.index + dayOnlyMatch[0].length),
        };
      }
    }
  }

  return null;
}

function parseDateExpression(text: string, reference: Date): DateParseResult | null {
  return (
    parseRelativeDate(text, reference) ??
    parseWeekdayDate(text, reference) ??
    parseExplicitDate(text, reference)
  );
}

function applyPeriod(hours: number, period: string | undefined): number | null {
  if (!period) {
    if (hours >= 0 && hours <= 23) return hours;
    return null;
  }

  const normalized = stripDiacritics(period.toLocaleLowerCase("pt-BR"));

  if (normalized.includes("manha")) {
    if (hours === 12) return 0;
    if (hours >= 1 && hours <= 11) return hours;
    return null;
  }

  if (normalized.includes("tarde")) {
    if (hours === 12) return 12;
    if (hours >= 1 && hours <= 11) return hours + 12;
    return null;
  }

  if (normalized.includes("noite")) {
    if (hours === 12) return 0;
    if (hours >= 1 && hours <= 11) return hours + 12;
    return null;
  }

  return hours;
}

function parseTimeExpression(text: string): TimeParseResult | null {
  const candidates: TimeParseResult[] = [];

  const pushCandidate = (hours: number, minutes: number, start: number, end: number) => {
    if (!isValidTime(hours, minutes)) return;
    candidates.push({
      hours,
      minutes,
      span: expandSpan(text, start, end),
    });
  };

  for (const match of allMatches(text, new RegExp(`${LB}meio[-\\s]?dia${RB}`, "iu"))) {
    if (match.index === undefined) continue;
    pushCandidate(12, 0, match.index, match.index + match[0].length);
  }

  for (const match of allMatches(text, new RegExp(`${LB}meia[-\\s]?noite${RB}`, "iu"))) {
    if (match.index === undefined) continue;
    pushCandidate(0, 0, match.index, match.index + match[0].length);
  }

  const halfWord = new RegExp(
    `${LB}(?:[àa]s)\\s+(\\d{1,2}|[\\p{L}]+)\\s+e\\s+meia(?:\\s*(?:horas?)?)?(?:\\s+da\\s+(manh[aã]|tarde|noite))?${RB}`,
    "iu",
  );

  for (const match of allMatches(text, halfWord)) {
    if (match.index === undefined) continue;
    const value = parseNumberToken(match[1]);
    if (value === null) continue;
    const hours = applyPeriod(value, match[2]);
    if (hours === null) continue;
    pushCandidate(hours, 30, match.index, match.index + match[0].length);
  }

  const wordClock = new RegExp(
    `${LB}(?:[àa]s)\\s+((?:vinte|trinta)(?:\\s+e\\s+[\\p{L}]+)?|[\\p{L}]+)(?!\\s+e\\s+meia)(?:\\s*(?:horas?)?)?(?:\\s+da\\s+(manh[aã]|tarde|noite))?${RB}`,
    "iu",
  );

  for (const match of allMatches(text, wordClock)) {
    if (match.index === undefined) continue;
    const value = parseNumberToken(match[1]);
    if (value === null) continue;
    const hours = applyPeriod(value, match[2]);
    if (hours === null) continue;
    pushCandidate(hours, 0, match.index, match.index + match[0].length);
  }

  const numericClock = new RegExp(
    `${LB}(?:(?:[àa]s)\\s*)?(\\d{1,2})(?:[:hH](\\d{2}))?(?:\\s*(?:horas?|hrs?|hs?))?(?:\\s+da\\s+(manh[aã]|tarde|noite))?${RB}`,
    "iu",
  );

  for (const match of allMatches(text, numericClock)) {
    if (match.index === undefined) continue;

    const before = text.slice(Math.max(0, match.index - 4), match.index);
    if (/dia\s*$/iu.test(before)) continue;

    const raw = match[0];
    const hasCue =
      /(?:[àa]s)/iu.test(raw) ||
      /hora|hrs?|hs?/iu.test(raw) ||
      /[:hH]\d{2}/.test(raw) ||
      /da\s+(manh[aã]|tarde|noite)/iu.test(raw);

    if (!hasCue) continue;

    const hoursRaw = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    const hours = applyPeriod(hoursRaw, match[3]);
    if (hours === null) continue;

    pushCandidate(hours, minutes, match.index, match.index + match[0].length);
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

  if (candidate.getTime() > reference.getTime()) {
    return today;
  }

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
  const displayBase = normalizeText(original);
  const normalized = normalizeForMatch(original);

  if (!normalized) {
    return {
      description: "",
      date: null,
      time: null,
      alertMinutes: DEFAULT_ALERT_MINUTES,
      confidence: { date: false, time: false },
    };
  }

  const dateResult = parseDateExpression(normalized, referenceDate);
  const timeResult = parseTimeExpression(normalized);
  const hasValidDate = Boolean(dateResult?.date) && !dateResult?.invalid;
  const hasInvalidDate = Boolean(dateResult?.invalid);

  const spans: MatchSpan[] = [];
  if (dateResult) spans.push(dateResult.span);
  if (timeResult) spans.push(timeResult.span);

  let description: string;

  if (!dateResult && !timeResult) {
    description = original;
  } else {
    // Índices do texto normalizado em minúsculas alinham com displayBase (mesmo comprimento).
    description = capitalizeDescription(removeSpans(displayBase, spans));
    if (!description) {
      description = original;
    }
  }

  let date: string | null = null;
  let time: string | null = null;
  let dateFromTimeOnly = false;

  if (timeResult) {
    time = formatTime(timeResult.hours, timeResult.minutes);
  }

  if (hasValidDate && dateResult?.date) {
    date = formatDate(dateResult.date);
  } else if (timeResult && !hasInvalidDate) {
    date = formatDate(
      resolveDateForTimeOnly(referenceDate, timeResult.hours, timeResult.minutes),
    );
    dateFromTimeOnly = true;
  }

  return {
    description,
    date,
    time,
    alertMinutes: DEFAULT_ALERT_MINUTES,
    confidence: {
      date: hasValidDate || dateFromTimeOnly,
      time: Boolean(timeResult),
    },
  };
}
