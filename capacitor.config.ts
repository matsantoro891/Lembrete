import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.lembretems.app",
  appName: "Lembrete MS",
  // Ship the actual interface inside the iPhone app, including offline startup.
  // The old public/index.html only displayed a permanent loading placeholder.
  webDir: "dist-native",
  ios: {
    contentInset: "automatic",
  },
  plugins: {
    LocalNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
};

export default config;
