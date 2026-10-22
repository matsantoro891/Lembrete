import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export const WEB_NOTIFICATIONS_MESSAGE =
  "Nesta versão, no navegador ou na Tela de Início, os avisos aparecem somente com o Lembrete MS aberto e visível. Para receber avisos com o app fechado ou o iPhone bloqueado, é necessária a versão nativa para iPhone.";

export const PERMISSION_DENIED_MESSAGE =
  "As notificações não foram autorizadas. Você pode liberá-las nos Ajustes do iPhone.";

export const TEST_NOTIFICATION_SCHEDULED_MESSAGE = "Notificação de teste programada para daqui a 10 segundos.";
