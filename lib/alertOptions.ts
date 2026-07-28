export const DEFAULT_ALERT_MINUTES = 10;

export const ALERT_OPTIONS = [
  { value: 0, label: "No momento do compromisso" },
  { value: 5, label: "5 minutos antes" },
  { value: 10, label: "10 minutos antes" },
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 1440, label: "1 dia antes" },
] as const;

export const ALLOWED_ALERT_MINUTES = new Set<number>(
  ALERT_OPTIONS.map((option) => option.value),
);

export function alarmTrigger(minutes: number): string {
  if (minutes === 0) return "PT0M";
  if (minutes === 1440) return "-P1D";
  if (minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

export function isAllowedAlertMinutes(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && ALLOWED_ALERT_MINUTES.has(value);
}
