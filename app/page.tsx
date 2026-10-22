"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALERT_OPTIONS, DEFAULT_ALERT_MINUTES } from "@/lib/alertOptions";
import {
  cancelAllReminderNotifications,
  cancelReminderNotification,
  checkNotificationPermission,
  ensureNotificationPermissionForReminder,
  registerNotificationListeners,
  requestNotificationPermission,
  scheduleTestNotification,
  syncReminderNotifications,
  type NotificationPermissionStatus,
} from "@/lib/localNotifications";
import { getTestNotificationId } from "@/lib/notificationIds";
import { completeAppleReminder, isAppleRemindersAvailable, openAppleCalendarEvent, removeAppleReminder, saveAppleReminder } from "@/lib/appleReminders";
import { readReminders, STORAGE_KEY, upsertReminder, writeReminders, type Reminder } from "@/lib/reminders";
import { isAppleMobileWeb, reminderShareData, shareReminderToIPhone, type ShareReminderResult } from "@/lib/shareReminder";
import { parseReminderText } from "@/lib/parseReminderText";
import {
  isNativePlatform,
  PERMISSION_DENIED_MESSAGE,
  TEST_NOTIFICATION_SCHEDULED_MESSAGE,
  WEB_NOTIFICATIONS_MESSAGE,
} from "@/lib/platform";
import {
  PAST_ALERT_MESSAGE,
  toNotificationPayload,
} from "@/lib/reminderNotifications";

type Tab = "today" | "upcoming" | "late";

const CALENDAR_TIP_KEY = "lembrete-voz-calendar-tip-seen";
const NOTIFICATIONS_ENABLED_KEY = "lembrete-ms-notifications-enabled";
const APPLE_REMINDERS_ENABLED_KEY = "lembrete-ms-apple-reminders-enabled";
const AUTO_PARSE_STATUS =
  "Data e horário identificados automaticamente. Revise antes de salvar.";

function formatPermissionStatus(status: NotificationPermissionStatus): string {
  if (status === "granted") return "Permitidas";
  if (status === "denied") return "Não permitidas";
  if (status === "prompt") return "Não solicitadas";
  return "Avisos com o aplicativo aberto";
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
  const [foregroundAlerts, setForegroundAlerts] = useState<Array<{ text: string; reminderId?: string }>>([]);
  const foregroundAlert = foregroundAlerts[0] ?? null;
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionStatus>("unsupported");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saveToApple, setSaveToApple] = useState(true);
  const [appleDevice, setAppleDevice] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState("");
  const [shareFallback, setShareFallback] = useState<Reminder | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const [settingsStatus, setSettingsStatus] = useState("");
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");
  const remindersRef = useRef<Reminder[]>([]);
  const busyRef = useRef(false);

  function commitReminders(next: Reminder[]) {
    writeReminders(window.localStorage, next);
    remindersRef.current = next;
    setReminders(next);
  }

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
      const saved = readReminders(window.localStorage);
      remindersRef.current = saved;
      setReminders(saved);
      setNotificationsEnabled(window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== "0");
      setSaveToApple(window.localStorage.getItem(APPLE_REMINDERS_ENABLED_KEY) !== "0");
      setStorageReady(true);
    } catch {
      setStatus("Não foi possível carregar os lembretes deste aparelho. Os dados existentes foram preservados. Libere o armazenamento e reabra o aplicativo.");
    }
    setAppleDevice(isAppleMobileWeb() || isAppleRemindersAvailable());
    refreshNotificationPermission().catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = registerNotificationListeners({
      onAction: (reminderId) => {
        focusReminder(reminderId);
      },
      onReceived: ({ body, reminderId }) => {
        setForegroundAlerts((current) => [...current, { text: body || "Você tem um lembrete.", reminderId }]);
      },
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    let active = true;
    async function sync() {
      try {
        if (!notificationsEnabled) {
          await cancelAllReminderNotifications();
          if (active) setNotificationNotice("");
          return;
        }
        const result = await syncReminderNotifications(reminders
          .map(toNotificationPayload)
          .filter((item): item is NonNullable<typeof item> => item !== null));
        if (active) setNotificationNotice(result.reason === "permission"
          ? "Permita as notificações nas Configurações para receber os avisos do Lembrete MS."
          : result.deferred > 0
            ? `${result.deferred} lembrete(s) salvo(s) ainda sem notificação: o iPhone limita os avisos pendentes. Os mais próximos foram programados. Reabra o aplicativo para programar os restantes.`
            : "");
      } catch {
        if (active) setNotificationNotice("Os lembretes estão salvos, mas houve uma falha ao atualizar os avisos. Abra Configurações e tente ativar as notificações novamente.");
      }
    }
    void sync();
    return () => { active = false; };
  }, [reminders, notificationsEnabled, notificationPermission, storageReady, clockTick]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      refreshNotificationPermission().catch(() => undefined);
      setClockTick((value) => value + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    // A second open tab must not retain alerts for a deleted or edited reminder.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== NOTIFICATIONS_ENABLED_KEY && event.key !== APPLE_REMINDERS_ENABLED_KEY) return;
      try {
        const next = readReminders(window.localStorage);
        remindersRef.current = next;
        setReminders(next);
        setNotificationsEnabled(window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== "0");
        setSaveToApple(window.localStorage.getItem(APPLE_REMINDERS_ENABLED_KEY) !== "0");
      } catch {
        setStatus("Não foi possível atualizar os lembretes alterados em outra aba.");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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
  }, [reminders, clockTick]);

  const visibleReminders = grouped[activeTab].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  const editingAppleLinked = Boolean(editingReminderId && reminders.find((item) => item.id === editingReminderId)?.appleReminderId);
  const canAdd = storageReady && !isSaving && text.trim().length > 0 && Boolean(date) && Boolean(time);

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

  function persistReminder(startsAt: Date) {
    const result = upsertReminder(remindersRef.current, {
      text, startsAt, alertMinutes, editingId: editingReminderId,
    });
    commitReminders(result.reminders);
    setEditingReminderId(null);
    return result;
  }

  async function updateSavedReminderNotification(reminder: Reminder): Promise<string> {
    if (!notificationsEnabled) return "Avisos do aplicativo desativados nas Configurações.";
    try {
      if (!reminder.notifyAt) {
        await cancelReminderNotification(reminder.notificationId);
        return PAST_ALERT_MESSAGE;
      }
      if (isNativePlatform()) {
        const permission = await ensureNotificationPermissionForReminder();
        setNotificationPermission(permission.status);
        if (permission.status !== "granted") return permission.deniedMessage ?? PERMISSION_DENIED_MESSAGE;
      }
      const result = await syncReminderNotifications(remindersRef.current
        .map(toNotificationPayload)
        .filter((item): item is NonNullable<typeof item> => item !== null));
      if (result.reason === "permission") return PERMISSION_DENIED_MESSAGE;
      if (result.deferredReminderIds.includes(reminder.id)) {
        return "O lembrete foi salvo, mas o limite de notificações pendentes do iPhone foi atingido. Reabra o aplicativo depois dos próximos avisos para programar este lembrete.";
      }
      return result.mode === "native"
        ? `Notificação programada para ${formatReminderDate(reminder.notifyAt)}.`
        : `Aviso programado para ${formatReminderDate(reminder.notifyAt)}, enquanto o aplicativo estiver aberto.`;
    } catch {
      return "O lembrete está salvo, mas não foi possível programar o aviso. Tente ativar as notificações nas Configurações.";
    }
  }

  async function saveNativeAppleReminder(reminder: Reminder): Promise<string> {
    try {
      const result = await saveAppleReminder(reminder);
      const next = remindersRef.current.map((item) => item.id === reminder.id
        ? { ...item, appleReminderId: result.identifier } : item);
      commitReminders(next);
      return result.created ? "Salvo também no Lembretes do iPhone." : "Atualizado também no Lembretes do iPhone.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar no Lembretes do iPhone.";
      return `O lembrete permanece salvo neste aplicativo. ${message}`;
    }
  }

  function shareResultMessage(result: ShareReminderResult, reminder: Reminder): string {
    if (result === "shared") return "Compartilhamento concluído. Confira se você adicionou o item no Lembretes do iPhone e ajustou a data e o alerta.";
    if (result === "cancelled") return "Compartilhamento cancelado; o lembrete continua salvo neste aplicativo.";
    setShareFallback(reminder);
    return "O lembrete está salvo. Use as opções abaixo para enviá-lo ao Lembretes do iPhone.";
  }

  async function handleSaveReminder() {
    if (busyRef.current) return;
    const startsAt = selectedDateTime();
    if (!storageReady || !startsAt || !text.trim()) {
      setStatus("Preencha o texto, a data e o horário.");
      return;
    }
    busyRef.current = true;
    setIsSaving(true);
    try {
      // Persist synchronously. Keep navigator.share in this same user gesture.
      const result = persistReminder(startsAt);
      const baseMessage = result.updated ? "Lembrete atualizado." : "Lembrete salvo.";
      setStatus(baseMessage);
      const shouldSaveToApple = (saveToApple || Boolean(result.reminder.appleReminderId)) && appleDevice;
      const webShare = shouldSaveToApple && !isNativePlatform()
        ? shareReminderToIPhone(result.reminder) : null;
      const notificationMessage = await updateSavedReminderNotification(result.reminder);
      let appleMessage = "";
      if (shouldSaveToApple && isNativePlatform()) {
        appleMessage = await saveNativeAppleReminder(result.reminder);
      } else if (webShare) {
        appleMessage = shareResultMessage(await webShare, result.reminder);
      }
      setStatus([baseMessage, notificationMessage, appleMessage].filter(Boolean).join(" "));
    } catch {
      setStatus("Não foi possível salvar neste aparelho. Verifique o armazenamento e tente novamente; o texto continua preenchido.");
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  }

  async function openCalendar() {
    if (busyRef.current) return;
    const startsAt = selectedDateTime();
    if (!storageReady || !startsAt || !text.trim()) {
      setStatus("Preencha o texto, a data e o horário.");
      return;
    }
    busyRef.current = true;
    setIsSaving(true);
    let locallySaved = false;
    try {
      const { reminder } = persistReminder(startsAt);
      locallySaved = true;
      const notificationMessage = await updateSavedReminderNotification(reminder);
      if (isNativePlatform()) {
        const appleMessage = reminder.appleReminderId ? await saveNativeAppleReminder(reminder) : "";
        const result = await openAppleCalendarEvent(reminder);
        setStatus(`${result.saved ? "Lembrete salvo no aplicativo e evento adicionado ao Calendário." : "Lembrete salvo no aplicativo. Inclusão no Calendário cancelada."} ${notificationMessage} ${appleMessage}`);
      } else {
        setStatus(`Lembrete salvo. ${notificationMessage}`);
        const params = new URLSearchParams({
          texto: reminder.text, inicio: reminder.startsAt, aviso: String(reminder.alertMinutes),
        });
        window.location.assign(`/api/calendario?${params.toString()}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o Calendário.";
      setStatus(locallySaved ? `O lembrete permanece salvo neste aplicativo. ${message}`
        : "Não foi possível salvar neste aparelho. Verifique o armazenamento e tente novamente.");
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  }

  function handleAddCalendar() {
    if (!canAdd) return;
    try {
      if (window.localStorage.getItem(CALENDAR_TIP_KEY) !== "1") {
        setShowCalendarTip(true);
        return;
      }
    } catch { /* The explanatory sheet remains available when storage is blocked. */ }
    void openCalendar();
  }

  function confirmCalendarTip() {
    try { window.localStorage.setItem(CALENDAR_TIP_KEY, "1"); } catch { /* Nonessential preference. */ }
    setShowCalendarTip(false);
    void openCalendar();
  }

  function changeAppleSavePreference(enabled: boolean) {
    try {
      window.localStorage.setItem(APPLE_REMINDERS_ENABLED_KEY, enabled ? "1" : "0");
      setSaveToApple(enabled);
    } catch {
      setStatus("Não foi possível guardar a preferência neste aparelho.");
    }
  }

  function clearForm() {
    if (busyRef.current) return;
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
    if (busyRef.current) return;
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
    if (busyRef.current) return;
    busyRef.current = true;
    setIsSaving(true);
    try {
      const nextEnabled = !notificationsEnabled;
      window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, nextEnabled ? "1" : "0");
      setNotificationsEnabled(nextEnabled);
      if (!nextEnabled) {
        await cancelAllReminderNotifications();
        setForegroundAlerts([]);
        setSettingsStatus("Avisos do Lembrete MS desativados e agendamentos cancelados. Os avisos já salvos no Calendário ou no Lembretes da Apple são independentes.");
        return;
      }
      if (isNativePlatform()) {
        const permission = await requestNotificationPermission();
        setNotificationPermission(permission.status);
        if (permission.status !== "granted") {
          setSettingsStatus(permission.deniedMessage ?? PERMISSION_DENIED_MESSAGE);
          return;
        }
      }
      const result = await syncReminderNotifications(remindersRef.current
        .map(toNotificationPayload)
        .filter((item): item is NonNullable<typeof item> => item !== null));
      setSettingsStatus(result.deferred > 0
        ? `${result.scheduled} aviso(s) programado(s); ${result.deferred} aguardam vaga no limite do iPhone. Reabra o aplicativo após os próximos avisos.`
        : isNativePlatform() ? "Notificações ativadas. Os lembretes futuros foram programados." : WEB_NOTIFICATIONS_MESSAGE);
    } catch {
      setSettingsStatus("Não foi possível atualizar os avisos. Tente novamente.");
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleTestNotification() {
    if (busyRef.current) return;
    if (!notificationsEnabled) {
      setSettingsStatus("Ative os avisos antes de testar.");
      return;
    }
    busyRef.current = true;
    setIsSaving(true);
    try {
      if (isNativePlatform()) {
        const permission = await requestNotificationPermission();
        setNotificationPermission(permission.status);
        if (permission.status !== "granted") {
          setSettingsStatus(permission.deniedMessage ?? PERMISSION_DENIED_MESSAGE);
          return;
        }
      }
      const result = await scheduleTestNotification(getTestNotificationId());
      setSettingsStatus(result.scheduled
        ? (result.mode === "native" ? TEST_NOTIFICATION_SCHEDULED_MESSAGE : "Aviso de teste em 10 segundos. Mantenha esta tela aberta.")
        : result.reason === "limit" ? "O limite de notificações pendentes foi atingido. Libere um aviso antes de testar." : PERMISSION_DENIED_MESSAGE);
    } catch {
      setSettingsStatus("Não foi possível programar o teste de notificação.");
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  }

  async function changeReminderState(id: string, action: "complete" | "remove") {
    if (busyRef.current) return;
    const reminder = remindersRef.current.find((item) => item.id === id);
    if (!reminder) return;
    busyRef.current = true;
    setIsSaving(true);
    let locallySaved = false;
    try {
      commitReminders(action === "remove"
        ? remindersRef.current.filter((item) => item.id !== id)
        : remindersRef.current.map((item) => item.id === id ? { ...item, completed: true, notifyAt: null } : item));
      locallySaved = true;
      if (editingReminderId === id) setEditingReminderId(null);
      setForegroundAlerts((current) => current.filter((item) => item.reminderId !== id));
      await cancelReminderNotification(reminder.notificationId);
      if (reminder.appleReminderId && isAppleRemindersAvailable()) {
        if (action === "complete") await completeAppleReminder(reminder);
        else await removeAppleReminder(reminder);
      }
      setStatus(action === "complete" ? "Lembrete concluído; aviso cancelado." : "Lembrete excluído; aviso cancelado.");
    } catch {
      setStatus(locallySaved
        ? "O lembrete foi atualizado neste aplicativo, mas houve uma falha ao atualizar os avisos ou o Lembretes do iPhone. Confira os Ajustes e o app Lembretes."
        : "Não foi possível gravar a alteração neste aparelho. O lembrete foi preservado.");
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  }

  async function clearAllReminders() {
    if (busyRef.current || !storageReady || !remindersRef.current.length) return;
    if (!window.confirm("Apagar todos os lembretes deste aparelho e suas cópias criadas no Lembretes do iPhone? Os eventos do Calendário serão mantidos.")) return;
    busyRef.current = true;
    setIsSaving(true);
    const previous = remindersRef.current;
    let locallySaved = false;
    try {
      commitReminders([]);
      locallySaved = true;
      setEditingReminderId(null);
      setForegroundAlerts([]);
      await cancelAllReminderNotifications();
      const results = await Promise.allSettled(previous.filter((item) => item.appleReminderId && isAppleRemindersAvailable())
        .map((item) => removeAppleReminder(item)));
      setSettingsStatus(results.some((result) => result.status === "rejected")
        ? "Lembretes locais apagados. Algumas cópias no Lembretes do iPhone não puderam ser removidas; confira o aplicativo da Apple."
        : "Lembretes apagados e avisos cancelados.");
    } catch {
      setSettingsStatus(locallySaved
        ? "Lembretes locais apagados, mas houve uma falha ao cancelar os avisos ou atualizar o Lembretes do iPhone."
        : "Não foi possível apagar os lembretes; os dados existentes foram preservados.");
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
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

      {foregroundAlert ? (
        <aside className="reminder-alert" role="alert" aria-live="assertive">
          <button type="button" className="reminder-alert-content" onClick={() => {
            if (foregroundAlert.reminderId) focusReminder(foregroundAlert.reminderId);
          }}>
            <strong>Agora · Lembrete MS{foregroundAlerts.length > 1 ? ` · 1 de ${foregroundAlerts.length}` : ""}</strong>
            <span>{foregroundAlert.text}</span>
          </button>
          <button className="reminder-alert-close" type="button" aria-label="Fechar aviso" onClick={() => setForegroundAlerts((current) => current.slice(1))}>×</button>
        </aside>
      ) : null}

      <section className="creator-card" aria-labelledby="creator-label">
        <div className="creator-decoration creator-decoration-one" />
        <div className="creator-decoration creator-decoration-two" />
        <p id="creator-label" className="eyebrow">✣ CRIAÇÃO RÁPIDA</p>

        <button
          type="button"
          className={`microphone-button ${isListening ? "is-listening" : ""}`}
          disabled={isSaving}
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
          disabled={isSaving}
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            applyParsedReminder(value, { updateDescription: false });
          }}
          rows={3}
          maxLength={500}
          aria-label="Texto do lembrete"
        />

        {status ? <p className="status-message" role="status">{status}</p> : null}

        <div className="fields-grid">
          <label className="field">
            <span>Data</span>
            <input type="date" value={date} disabled={isSaving} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Horário</span>
            <input type="time" value={time} disabled={isSaving} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label className="field field-full">
            <span>Alerta</span>
            <select value={alertMinutes} disabled={isSaving} onChange={(event) => setAlertMinutes(Number(event.target.value))}>
              {ALERT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="notification-mode">
          {!notificationsEnabled ? "Avisos do aplicativo desativados. Ative nas Configurações." : isNativePlatform()
            ? "O Lembrete MS avisa no horário do alerta, inclusive com o aplicativo fechado, após você permitir as notificações."
            : WEB_NOTIFICATIONS_MESSAGE}
        </p>
        {notificationNotice ? <p className="notification-warning" role="status">{notificationNotice}</p> : null}

        {appleDevice ? (
          <div className="apple-save-option">
            <label>
              <input type="checkbox" checked={saveToApple || editingAppleLinked} disabled={isSaving || editingAppleLinked} onChange={(event) => changeAppleSavePreference(event.target.checked)} />
              <span>{editingAppleLinked ? "Atualizar também no Lembretes do iPhone" : "Salvar também no Lembretes do iPhone"}</span>
            </label>
            <p>{isNativePlatform()
              ? "O título, a data e o alerta serão preenchidos após sua autorização. Lembretes já vinculados são atualizados automaticamente."
              : "Ao salvar, escolha Lembretes na tela de compartilhamento. Confira a data, o horário e o alerta antes de adicionar."}</p>
          </div>
        ) : null}

        <div className="creator-actions">
          <button className="save-reminder-button" type="button" disabled={!canAdd} onClick={handleSaveReminder}>
            {isSaving ? "Salvando…" : editingReminderId ? "Atualizar lembrete" : "Salvar lembrete"}
          </button>
          <button className="calendar-button" type="button" disabled={!canAdd} onClick={handleAddCalendar}>
            <CalendarIcon />
            <span>Adicionar ao Calendário</span>
          </button>
          <button className="new-reminder-button" type="button" disabled={isSaving} onClick={clearForm}>Novo lembrete</button>
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
                <button className="complete-button" type="button" disabled={isSaving} aria-label={`Concluir ${reminder.text}`} onClick={() => changeReminderState(reminder.id, "complete")} />
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
                <button className="delete-button" type="button" disabled={isSaving} onClick={() => changeReminderState(reminder.id, "remove")} aria-label={`Excluir ${reminder.text}`}>×</button>
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

      {shareFallback ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <h2 id="share-title">Lembrete salvo</h2>
            <p>Para salvar também no iPhone, toque em Compartilhar e escolha <strong>Lembretes</strong>. Confira a data, o horário e o alerta antes de adicionar. Se a opção não aparecer, copie o texto e cole no app Lembretes.</p>
            <button type="button" className="modal-primary" onClick={async () => {
              const reminder = shareFallback;
              const result = await shareReminderToIPhone(reminder);
              if (result !== "unavailable") setShareFallback(null);
              setStatus(shareResultMessage(result, reminder));
            }}>Compartilhar com Lembretes</button>
            <button type="button" className="modal-secondary" onClick={async () => {
              try {
                await navigator.clipboard.writeText(reminderShareData(shareFallback).text ?? shareFallback.text);
                setStatus("Texto copiado. Cole no app Lembretes e ajuste a data, o horário e o alerta.");
                setShareFallback(null);
              } catch {
                setStatus("Não foi possível copiar automaticamente. O texto do lembrete continua disponível no formulário.");
              }
            }}>Copiar texto do lembrete</button>
            <button type="button" className="modal-secondary" onClick={() => setShareFallback(null)}>Fechar</button>
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

              <div className="settings-row">
                <span>{isNativePlatform() ? "Ativar notificações" : "Ativar avisos neste aplicativo"}</span>
                <button
                  type="button"
                  className={`settings-toggle ${notificationsEnabled ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={notificationsEnabled}
                  aria-label="Ativar notificações"
                  disabled={isSaving || !storageReady}
                  onClick={handleToggleNotifications}
                />
              </div>

              <p className="settings-status">
                Status: <strong>{notificationsEnabled ? formatPermissionStatus(notificationPermission) : "Desativadas"}</strong>
              </p>

              <button type="button" className="modal-settings-button" disabled={isSaving || !notificationsEnabled} onClick={handleTestNotification}>
                Testar notificação
              </button>

              {!isNativePlatform() ? <p className="settings-note">{WEB_NOTIFICATIONS_MESSAGE}</p> : null}
              {notificationPermission === "denied" ? (
                <p className="settings-note">Abra Ajustes &gt; Lembrete MS &gt; Notificações no iPhone para autorizar os avisos.</p>
              ) : null}

              {settingsStatus ? <p className="settings-status">{settingsStatus}</p> : null}
            </section>

            <button type="button" className="modal-danger" disabled={isSaving || !storageReady} onClick={clearAllReminders}>Apagar lembretes salvos</button>
            <button type="button" className="modal-secondary" onClick={() => setShowSettings(false)}>Fechar</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
