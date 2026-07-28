"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALERT_OPTIONS, DEFAULT_ALERT_MINUTES } from "@/lib/alertOptions";
import {
  cancelReminderNotification,
  checkNotificationPermission,
  ensureNotificationPermissionForReminder,
  registerNotificationListeners,
  requestNotificationPermission,
  scheduleReminderNotification,
  scheduleTestNotification,
  syncReminderNotifications,
  type NotificationPermissionStatus,
} from "@/lib/localNotifications";
import { createNotificationId, getTestNotificationId } from "@/lib/notificationIds";
import { parseReminderText } from "@/lib/parseReminderText";
import {
  isNativePlatform,
  PERMISSION_DENIED_MESSAGE,
  TEST_NOTIFICATION_SCHEDULED_MESSAGE,
  WEB_NOTIFICATIONS_MESSAGE,
} from "@/lib/platform";
import {
  buildSchedulableReminder,
  calculateNotificationDate,
  isNotificationInPast,
  PAST_ALERT_MESSAGE,
  toNotificationPayload,
  resolveNotifyAt,
  type SchedulableReminder,
} from "@/lib/reminderNotifications";

type Reminder = SchedulableReminder & {
  createdAt: string;
};

type Tab = "today" | "upcoming" | "late";

const STORAGE_KEY = "lembrete-voz-reminders-v1";
const CALENDAR_TIP_KEY = "lembrete-voz-calendar-tip-seen";
const NOTIFICATIONS_ENABLED_KEY = "lembrete-ms-notifications-enabled";
const AUTO_PARSE_STATUS =
  "Data e horário identificados automaticamente. Revise antes de salvar.";

function formatPermissionStatus(status: NotificationPermissionStatus): string {
  if (status === "granted") return "Permitidas";
  if (status === "denied") return "Não permitidas";
  if (status === "prompt") return "Não solicitadas";
  return "Indisponíveis nesta versão";
}

function startsAtToFields(startsAt: string): { date: string; time: string } {
  const value = new Date(startsAt);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

function formatReminderDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function GearIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.3h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.03H5.3v-3h.14A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7v-.08h3v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.14v3h-.14A1.7 1.7 0 0 0 19.4 15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg width="58" height="58" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16.5" cy="16.5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16.5 15v1.8l1.1.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [alertMinutes, setAlertMinutes] = useState(DEFAULT_ALERT_MINUTES);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [showCalendarTip, setShowCalendarTip] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [highlightedReminderId, setHighlightedReminderId] = useState<string | null>(null);
  const [foregroundAlert, setForegroundAlert] = useState("");
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionStatus>("unsupported");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");
  const remindersRef = useRef<Reminder[]>([]);

  async function refreshNotificationPermission() {
    const status = await checkNotificationPermission();
    setNotificationPermission(status);
    return status;
  }

  function focusReminder(reminderId: string) {
    const reminder = remindersRef.current.find((item) => item.id === reminderId);
    if (!reminder) return;

    const starts = new Date(reminder.startsAt);
    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    if (starts >= todayStart && starts <= todayEnd) {
      setActiveTab("today");
    } else if (starts > todayEnd) {
      setActiveTab("upcoming");
    } else {
      setActiveTab("late");
    }

    setHighlightedReminderId(reminderId);
    window.setTimeout(() => {
      setHighlightedReminderId((current) => (current === reminderId ? null : current));
    }, 4000);
  }

  useEffect(() => {
    try {
      setNotificationsEnabled(window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === "1");
    } catch {
      setNotificationsEnabled(false);
    }

    refreshNotificationPermission().catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = registerNotificationListeners({
      onAction: (reminderId) => {
        focusReminder(reminderId);
      },
      onReceived: ({ body }) => {
        setForegroundAlert(body ? `Lembrete MS: ${body}` : "Lembrete MS");
      },
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved) as Array<Partial<Reminder> & { id: string; text: string; startsAt: string }>;
      setReminders(
        parsed.map((item) => ({
          ...buildSchedulableReminder({
            id: item.id,
            text: item.text,
            startsAt: item.startsAt,
            alertMinutes: item.alertMinutes,
            notificationId: item.notificationId,
            notifyAt: item.completed ? null : resolveNotifyAt(item.startsAt, item.alertMinutes),
            completed: item.completed,
          }),
          createdAt: item.createdAt ?? new Date().toISOString(),
        })),
      );
    } catch {
      setStatus("Não foi possível carregar os lembretes salvos neste aparelho.");
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    } catch {
      // O app continua funcionando mesmo se o armazenamento local estiver indisponível.
    }
  }, [reminders]);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const payloads = reminders
      .map(toNotificationPayload)
      .filter((item): item is NonNullable<typeof item> => item !== null);

    syncReminderNotifications(payloads).catch(() => undefined);
  }, [reminders]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
    };
  }, []);

  const grouped = useMemo(() => {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const active = reminders.filter((item) => !item.completed);

    return {
      today: active.filter((item) => {
        const starts = new Date(item.startsAt);
        return starts >= todayStart && starts <= todayEnd;
      }),
      upcoming: active.filter((item) => new Date(item.startsAt) > todayEnd),
      late: active.filter((item) => new Date(item.startsAt) < todayStart),
    };
  }, [reminders]);

  const visibleReminders = grouped[activeTab].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  const canAdd = text.trim().length > 0 && Boolean(date) && Boolean(time);

  function applyParsedReminder(
    value: string,
    options?: { updateDescription?: boolean; fromVoice?: boolean },
  ) {
    const parsed = parseReminderText(value);
    const updateDescription = options?.updateDescription ?? false;
    const fromVoice = options?.fromVoice ?? false;

    if (updateDescription && parsed.description) {
      setText(parsed.description);
    }

    let filledSomething = false;

    if (!date && parsed.date) {
      setDate(parsed.date);
      filledSomething = true;
    }

    if (!time && parsed.time) {
      setTime(parsed.time);
      filledSomething = true;
    }

    const identified = parsed.confidence.date || parsed.confidence.time;

    if (identified && (filledSomething || fromVoice)) {
      setAlertMinutes(parsed.alertMinutes);
      setStatus(AUTO_PARSE_STATUS);
    }
  }

  function startListening() {
    setStatus("");

    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      setStatus("A transcrição por voz não está disponível neste navegador. Você pode digitar o lembrete.");
      return;
    }

    recognitionRef.current?.abort?.();
    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    baseTextRef.current = text.trim();

    recognition.onstart = () => {
      setIsListening(true);
      setStatus("Ouvindo… fale o seu lembrete.");
    };

    recognition.onresult = (event: any) => {
      let transcript = "";
      let hasFinalResult = false;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
        if (event.results[index].isFinal) hasFinalResult = true;
      }

      const nextText = [baseTextRef.current, transcript.trim()].filter(Boolean).join(" ").trim();
      setText(nextText);
      if (hasFinalResult) {
        applyParsedReminder(nextText, { updateDescription: true, fromVoice: true });
      }
    };

    recognition.onerror = (event: any) => {
      const messages: Record<string, string> = {
        "not-allowed": "Permita o acesso ao microfone para usar a transcrição por voz.",
        "audio-capture": "Não foi possível acessar o microfone.",
        "no-speech": "Não ouvi nenhuma fala. Toque novamente e tente de novo.",
        network: "A transcrição por voz não conseguiu se conectar. Verifique a internet.",
      };
      setStatus(messages[event.error] ?? "Não foi possível transcrever agora. Você pode tentar novamente ou digitar.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setStatus((current) => {
        if (current === AUTO_PARSE_STATUS) return current;
        if (current.startsWith("Ouvindo")) {
          return "Revise o texto e escolha a data e o horário.";
        }
        return current;
      });
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setStatus("A transcrição já está em andamento. Aguarde um instante.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
    setIsListening(false);
  }

  function selectedDateTime(): Date | null {
    if (!date || !time) return null;
    const result = new Date(`${date}T${time}:00`);
    return Number.isNaN(result.getTime()) ? null : result;
  }

  async function persistReminder(startsAt: Date): Promise<"saved" | "updated" | "past-alert"> {
    const trimmedText = text.trim();
    const existing = editingReminderId
      ? reminders.find((item) => item.id === editingReminderId)
      : reminders.find(
          (item) =>
            item.text === trimmedText &&
            item.startsAt === startsAt.toISOString() &&
            !item.completed,
        );

    const id = existing?.id ?? crypto.randomUUID();
    const notificationId = existing?.notificationId ?? createNotificationId();
    const notifyAtDate = calculateNotificationDate(startsAt, alertMinutes);
    const isPast = !notifyAtDate || isNotificationInPast(notifyAtDate);
    const notifyAt = isPast ? null : notifyAtDate.toISOString();

    if (existing?.notificationId) {
      await cancelReminderNotification(existing.notificationId);
    }

    if (notifyAt && isNativePlatform()) {
      const { status, deniedMessage } = await ensureNotificationPermissionForReminder();
      await refreshNotificationPermission();

      if (status === "granted") {
        await scheduleReminderNotification({
          notificationId,
          body: trimmedText,
          notifyAt,
          reminderId: id,
        });
      } else if (deniedMessage) {
        setStatus(deniedMessage);
      }
    }

    const nextReminder: Reminder = {
      ...buildSchedulableReminder({
        id,
        text: trimmedText,
        startsAt: startsAt.toISOString(),
        alertMinutes,
        notificationId,
        notifyAt,
        completed: false,
      }),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    const nextReminders = existing
      ? reminders.map((item) => (item.id === id ? nextReminder : item))
      : [...reminders, nextReminder];

    setReminders(nextReminders);
    setEditingReminderId(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextReminders));
    } catch {
      // O lembrete continua salvo na memória do aplicativo.
    }

    if (isPast) return "past-alert";
    return existing ? "updated" : "saved";
  }

  async function handleSaveReminder() {
    const startsAt = selectedDateTime();
    if (!startsAt || !text.trim()) {
      setStatus("Preencha o texto, a data e o horário.");
      return;
    }

    const wasEditing = Boolean(editingReminderId);
    const result = await persistReminder(startsAt);
    if (result === "past-alert") {
      setStatus(PAST_ALERT_MESSAGE);
      return;
    }

    setStatus(wasEditing || result === "updated" ? "Lembrete atualizado." : "Lembrete salvo.");
  }

  async function openCalendar() {
    const startsAt = selectedDateTime();
    if (!startsAt || !text.trim()) {
      setStatus("Preencha o texto, a data e o horário.");
      return;
    }

    const result = await persistReminder(startsAt);
    if (result === "past-alert") {
      setStatus(PAST_ALERT_MESSAGE);
    }

    const params = new URLSearchParams({
      texto: text.trim(),
      inicio: startsAt.toISOString(),
      aviso: String(alertMinutes),
    });

    window.location.assign(`/api/calendario?${params.toString()}`);
  }

  function handleAddCalendar() {
    if (!canAdd) return;

    const alreadySawTip = window.localStorage.getItem(CALENDAR_TIP_KEY) === "1";
    if (!alreadySawTip) {
      setShowCalendarTip(true);
      return;
    }

    openCalendar();
  }

  function confirmCalendarTip() {
    window.localStorage.setItem(CALENDAR_TIP_KEY, "1");
    setShowCalendarTip(false);
    openCalendar();
  }

  function clearForm() {
    const hasContent = Boolean(text || date || time);
    if (hasContent && !window.confirm("Limpar o lembrete atual e começar outro?")) return;
    recognitionRef.current?.abort?.();
    setText("");
    setDate("");
    setTime("");
    setAlertMinutes(DEFAULT_ALERT_MINUTES);
    setEditingReminderId(null);
    setStatus("");
  }

  function beginEditReminder(reminder: Reminder) {
    const fields = startsAtToFields(reminder.startsAt);
    setText(reminder.text);
    setDate(fields.date);
    setTime(fields.time);
    setAlertMinutes(reminder.alertMinutes);
    setEditingReminderId(reminder.id);
    setStatus("Editando lembrete. Ajuste os campos e salve novamente.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleToggleNotifications() {
    if (!isNativePlatform()) {
      setSettingsStatus(WEB_NOTIFICATIONS_MESSAGE);
      return;
    }

    const nextEnabled = !notificationsEnabled;
    setNotificationsEnabled(nextEnabled);
    window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, nextEnabled ? "1" : "0");

    if (!nextEnabled) {
      setSettingsStatus("Notificações desativadas neste aplicativo.");
      return;
    }

    const current = await refreshNotificationPermission();
    if (current === "denied") {
      setSettingsStatus(PERMISSION_DENIED_MESSAGE);
      return;
    }

    if (current === "granted") {
      setSettingsStatus("Notificações ativadas.");
      return;
    }

    const { status, deniedMessage } = await requestNotificationPermission();
    await refreshNotificationPermission();

    if (status === "granted") {
      setSettingsStatus("Notificações ativadas.");
      return;
    }

    setSettingsStatus(deniedMessage ?? PERMISSION_DENIED_MESSAGE);
  }

  async function handleTestNotification() {
    if (!isNativePlatform()) {
      setSettingsStatus(WEB_NOTIFICATIONS_MESSAGE);
      return;
    }

    const current = await refreshNotificationPermission();
    if (current === "denied") {
      setSettingsStatus(PERMISSION_DENIED_MESSAGE);
      return;
    }

    if (current !== "granted") {
      const { status, deniedMessage } = await requestNotificationPermission();
      await refreshNotificationPermission();
      if (status !== "granted") {
        setSettingsStatus(deniedMessage ?? PERMISSION_DENIED_MESSAGE);
        return;
      }
    }

    await scheduleTestNotification(getTestNotificationId());
    setSettingsStatus(TEST_NOTIFICATION_SCHEDULED_MESSAGE);
  }

  async function completeReminder(id: string) {
    const reminder = reminders.find((item) => item.id === id);
    if (reminder?.notificationId) {
      await cancelReminderNotification(reminder.notificationId);
    }

    setReminders((current) =>
      current.map((item) =>
        item.id === id ? { ...item, completed: true, notifyAt: null } : item,
      ),
    );
  }

  async function removeReminder(id: string) {
    const reminder = reminders.find((item) => item.id === id);
    if (reminder?.notificationId) {
      await cancelReminderNotification(reminder.notificationId);
    }

    setReminders((current) => current.filter((item) => item.id !== id));
  }

  async function clearAllReminders() {
    if (!reminders.length) return;
    if (!window.confirm("Apagar todos os lembretes salvos neste aparelho?")) return;

    await Promise.all(
      reminders
        .filter((item) => item.notificationId)
        .map((item) => cancelReminderNotification(item.notificationId)),
    );

    setReminders([]);
    setShowSettings(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="app-logo" aria-label="Lembrete MS">
            <span className="app-logo-line" aria-hidden="true" />
            <span className="app-logo-text">MS</span>
            <span className="app-logo-line" aria-hidden="true" />
          </div>
          <h1>Lembrete MS</h1>
        </div>
        <button
          className="settings-button"
          type="button"
          aria-label="Abrir configurações"
          onClick={() => {
            setSettingsStatus("");
            setShowSettings(true);
            refreshNotificationPermission().catch(() => undefined);
          }}
        >
          <GearIcon />
        </button>
      </header>

      <section className="creator-card" aria-labelledby="creator-label">
        <div className="creator-decoration creator-decoration-one" />
        <div className="creator-decoration creator-decoration-two" />
        <p id="creator-label" className="eyebrow">✣ CRIAÇÃO RÁPIDA</p>

        <button
          type="button"
          className={`microphone-button ${isListening ? "is-listening" : ""}`}
          onClick={isListening ? stopListening : startListening}
          aria-pressed={isListening}
        >
          <MicrophoneIcon />
          <span>{isListening ? "Parar" : "Falar"}</span>
        </button>

        <label className="sr-only" htmlFor="reminder-text">Texto do lembrete</label>
        <textarea
          id="reminder-text"
          className="reminder-textarea"
          value={text}
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            applyParsedReminder(value, { updateDescription: false });
          }}
          rows={3}
          maxLength={500}
          aria-label="Texto do lembrete"
        />

        {foregroundAlert ? (
          <p className="foreground-alert" role="status">{foregroundAlert}</p>
        ) : null}

        {status ? <p className="status-message" role="status">{status}</p> : null}

        <div className="fields-grid">
          <label className="field">
            <span>Data</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Horário</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label className="field field-full">
            <span>Alerta</span>
            <select value={alertMinutes} onChange={(event) => setAlertMinutes(Number(event.target.value))}>
              {ALERT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="creator-actions">
          <button className="save-reminder-button" type="button" disabled={!canAdd} onClick={handleSaveReminder}>
            {editingReminderId ? "Atualizar lembrete" : "Salvar lembrete"}
          </button>
          <button className="calendar-button" type="button" disabled={!canAdd} onClick={handleAddCalendar}>
            <CalendarIcon />
            <span>Adicionar ao Calendário</span>
          </button>
          <button className="new-reminder-button" type="button" onClick={clearForm}>Novo lembrete</button>
        </div>
      </section>

      <section className="reminders-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">SEUS LEMBRETES</p>
            <h2>{activeTab === "today" ? "Hoje" : activeTab === "upcoming" ? "Próximos" : "Atrasados"}</h2>
          </div>
          <button type="button" className="small-new-button" onClick={clearForm}>
            <PlusIcon /> Novo
          </button>
        </div>

        <div className="tabs" role="tablist" aria-label="Filtrar lembretes">
          <button className={activeTab === "today" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "today"} onClick={() => setActiveTab("today")}>Hoje <span>{grouped.today.length}</span></button>
          <button className={activeTab === "upcoming" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "upcoming"} onClick={() => setActiveTab("upcoming")}>Próximos <span>{grouped.upcoming.length}</span></button>
          <button className={activeTab === "late" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "late"} onClick={() => setActiveTab("late")}>Atrasados <span>{grouped.late.length}</span></button>
        </div>

        {visibleReminders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><CalendarIcon /></div>
            <h3>Nenhum lembrete aqui</h3>
            <p>Crie um lembrete por voz ou digitando uma frase.</p>
          </div>
        ) : (
          <div className="reminder-list">
            {visibleReminders.map((reminder) => (
              <article
                className={`reminder-item ${highlightedReminderId === reminder.id ? "is-highlighted" : ""} ${editingReminderId === reminder.id ? "is-editing" : ""}`}
                key={reminder.id}
              >
                <button className="complete-button" type="button" aria-label={`Concluir ${reminder.text}`} onClick={() => completeReminder(reminder.id)} />
                <button
                  className="reminder-copy-button"
                  type="button"
                  onClick={() => beginEditReminder(reminder)}
                  aria-label={`Editar ${reminder.text}`}
                >
                  <div className="reminder-copy">
                    <h3>{reminder.text}</h3>
                    <p>{formatReminderDate(reminder.startsAt)}</p>
                  </div>
                </button>
                <button className="delete-button" type="button" onClick={() => removeReminder(reminder.id)} aria-label={`Excluir ${reminder.text}`}>×</button>
              </article>
            ))}
          </div>
        )}

        <p className="local-note">Dados salvos localmente neste aparelho&nbsp;&nbsp;•&nbsp;&nbsp;Funciona sem conta</p>
      </section>

      {showCalendarTip ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="calendar-tip-title">
            <div className="modal-icon"><CalendarIcon /></div>
            <h2 id="calendar-tip-title">Abrir no Calendário</h2>
            <p>O iPhone abrirá o evento preparado. Toque em <strong>Adicionar</strong> para confirmar no Calendário.</p>
            <button type="button" className="modal-primary" onClick={confirmCalendarTip}>Continuar</button>
            <button type="button" className="modal-secondary" onClick={() => setShowCalendarTip(false)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <h2 id="settings-title">Configurações</h2>
            <p>Os lembretes ficam somente neste aparelho. Não há conta, banco de dados ou sincronização própria.</p>

            <section className="settings-section" aria-labelledby="notifications-settings-title">
              <h3 id="notifications-settings-title">Notificações</h3>

              {isNativePlatform() ? (
                <>
                  <div className="settings-row">
                    <span>Ativar notificações</span>
                    <button
                      type="button"
                      className={`settings-toggle ${notificationsEnabled ? "is-on" : ""}`}
                      role="switch"
                      aria-checked={notificationsEnabled}
                      aria-label="Ativar notificações"
                      onClick={handleToggleNotifications}
                    />
                  </div>

                  <p className="settings-status">
                    Status: <strong>{formatPermissionStatus(notificationPermission)}</strong>
                  </p>

                  <button type="button" className="modal-settings-button" onClick={handleTestNotification}>
                    Testar notificação
                  </button>

                  {notificationPermission === "denied" ? (
                    <p className="settings-note">
                      Abra Ajustes &gt; Lembrete MS &gt; Notificações no iPhone para autorizar os avisos.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="settings-note">{WEB_NOTIFICATIONS_MESSAGE}</p>
              )}

              {settingsStatus ? <p className="settings-status">{settingsStatus}</p> : null}
            </section>

            <button type="button" className="modal-danger" onClick={clearAllReminders}>Apagar lembretes salvos</button>
            <button type="button" className="modal-secondary" onClick={() => setShowSettings(false)}>Fechar</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
