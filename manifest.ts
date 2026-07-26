import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lembrete Voz",
    short_name: "Lembrete Voz",
    description: "Fale, confirme e adicione seus lembretes ao Calendário do iPhone.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#102a50",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
