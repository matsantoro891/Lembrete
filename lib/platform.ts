import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export const WEB_NOTIFICATIONS_MESSAGE =
  "As notificações próprias do Lembrete MS estarão disponíveis na versão instalada do aplicativo.";

export const PERMISSION_DENIED_MESSAGE =
  "As notificações não foram autorizadas. Você pode liberá-las nos Ajustes do iPhone.";

export const TEST_NOTIFICATION_SCHEDULED_MESSAGE = "Notificação de teste programada.";
