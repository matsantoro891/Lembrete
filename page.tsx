"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Reminder = {
  id: string;
  text: string;
  startsAt: string;
  alertMinutes: number;
  completed: boolean;
  createdAt: string;
};

type Tab = "today" | "upcoming" | "late";

const STORAGE_KEY = "lembrete-voz-reminders-v1";
const CALENDAR_TIP_KEY = "lembrete-voz-calendar-tip-seen";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimeValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeHour(hour: number): number {
  return Math.max(0, Math.min(23, hour));
}

function suggestDateAndTime(phrase: string): { date?: string; time?: string } {
  const text = phrase.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  const now = new Date();

  const minutesMatch = text.match(/daqui\s+(?:a\s+)?(\d{1,4})\s+minuto/);
  if (minutesMatch) {
    const result = new Date(now.getTime() + Number(minutesMatch[1]) * 60_000);
    return { date: localDateValue(result), time: localTimeValue(result) };
  }

  const hoursMatch = text.match(/daqui\s+(?:a\s+)?(\d{1,3})\s+hora/);
  if (hoursMatch) {
    const result = new Date(now.getTime() + Number(hoursMatch[1]) * 3_600_000);
    return { date: localDateValue(result), time: localTimeValue(result) };
  }

  const clockMatch = text.match(/(?:às|as)\s+(\d{1,2})(?:[:h](\d{2}))?/);
  const hour = clockMatch ? normalizeHour(Number(clockMatch[1])) : undefined;
  const minute = clockMatch?.[2] ? Math.min(59, Number(clockMatch[2])) : 0;

  if (text.includes("amanhã") || text.includes("amanha")) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    if (hour !== undefined) result.setHours(hour, minute, 0, 0);
    return {
      date: localDateValue(result),
      time: hour !== undefined ? localTimeValue(result) : undefined,
    };
  }

  if (text.includes("hoje")) {
    const result = new Date(now);
    if (hour !== undefined) result.setHours(hour, minute, 0, 0);
    return {
      date: localDateValue(result),
      time: hour !== undefined ? localTimeValue(result) : undefined,
    };
  }

  const dateMatch = text.match(/(?:dia\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    let year = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    const result = new Date(year, month, day, hour ?? 9, minute, 0, 0);
    return { date: localDateValue(result), time: hour !== undefined ? localTimeValue(result) : undefined };
  }

  if (hour !== undefined) {
    const result = new Date(now);
    result.setHours(hour, minute, 0, 0);
    if (result.getTime() <= now.getTime()) result.setDate(result.getDate() + 1);
    return { date: localDateValue(result), time: localTimeValue(result) };
  }

  return {};
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

function BellIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
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
  const [alertMinutes, setAlertMinutes] = useState(10);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [showCalendarTip, setShowCalendarTip] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setReminders(JSON.parse(saved) as Reminder[]);
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

  function applySuggestions(value: string) {
    const suggestion = suggestDateAndTime(value);
    if (!date && suggestion.date) setDate(suggestion.date);
    if (!time && suggestion.time) setTime(suggestion.time);
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
      if (hasFinalResult) applySuggestions(nextText);
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
      setStatus((current) => (current.startsWith("Ouvindo") ? "Revise o texto e escolha a data e o horário." : current));
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

  function saveReminder(startsAt: Date) {
    const existing = reminders.find(
      (item) => item.text === text.trim() && item.startsAt === startsAt.toISOString() && !item.completed,
    );

    if (existing) return;

    const nextReminders: Reminder[] = [
      ...reminders,
      {
        id: crypto.randomUUID(),
        text: text.trim(),
        startsAt: startsAt.toISOString(),
        alertMinutes,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ];

    setReminders(nextReminders);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextReminders));
    } catch {
      // O evento do calendário ainda será aberto, mesmo sem armazenamento local.
    }
  }

  function openCalendar() {
    const startsAt = selectedDateTime();
    if (!startsAt || !text.trim()) {
      setStatus("Preencha o texto, a data e o horário.");
      return;
    }

    saveReminder(startsAt);
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
    setAlertMinutes(10);
    setStatus("");
  }

  function completeReminder(id: string) {
    setReminders((current) =>
      current.map((item) => (item.id === id ? { ...item, completed: true } : item)),
    );
  }

  function removeReminder(id: string) {
    setReminders((current) => current.filter((item) => item.id !== id));
  }

  function clearAllReminders() {
    if (!reminders.length) return;
    if (!window.confirm("Apagar todos os lembretes salvos neste aparelho?")) return;
    setReminders([]);
    setShowSettings(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><BellIcon /></div>
          <div>
            <h1>Lembrete Voz</h1>
            <p>Fale. Confirme. Não esqueça.</p>
          </div>
        </div>
        <button className="settings-button" type="button" aria-label="Abrir configurações" onClick={() => setShowSettings(true)}>
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
            applySuggestions(value);
          }}
          rows={3}
          maxLength={500}
          aria-label="Texto do lembrete"
        />

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
              <option value={0}>Na hora</option>
              <option value={10}>10 minutos antes</option>
              <option value={30}>30 minutos antes</option>
              <option value={60}>1 hora antes</option>
              <option value={1440}>1 dia antes</option>
            </select>
          </label>
        </div>

        <div className="creator-actions">
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
              <article className="reminder-item" key={reminder.id}>
                <button className="complete-button" type="button" aria-label={`Concluir ${reminder.text}`} onClick={() => completeReminder(reminder.id)} />
                <div className="reminder-copy">
                  <h3>{reminder.text}</h3>
                  <p>{formatReminderDate(reminder.startsAt)}</p>
                </div>
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
            <button type="button" className="modal-danger" onClick={clearAllReminders}>Apagar lembretes salvos</button>
            <button type="button" className="modal-secondary" onClick={() => setShowSettings(false)}>Fechar</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
