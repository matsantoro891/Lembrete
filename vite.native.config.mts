import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Next.js remains the web server. The same React screen is bundled separately
// for Capacitor because the native app has no Next.js server or API routes.
export default defineConfig({
  root: fileURLToPath(new URL("./native", import.meta.url)),
  base: "./",
  publicDir: false,
  resolve: { alias: { "@": root } },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: fileURLToPath(new URL("./dist-native", import.meta.url)),
    emptyOutDir: true,
    target: "safari15",
  },
});
