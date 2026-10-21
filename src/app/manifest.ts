import type { MetadataRoute } from "next";
import { clubName } from "@/lib/env";

/**
 * Manifest do PWA — é o que torna o site instalável (ícone na tela inicial
 * do celular, janela sem barra do navegador). Gerado em /manifest.webmanifest
 * e linkado automaticamente pelo Next no <head>.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${clubName()} — Ranking de Tênis`,
    short_name: clubName(),
    description:
      "Classificação oficial de tênis: resultados informados pelos jogadores, confirmados pelo administrador e rankings publicados.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "pt-BR",
    categories: ["sports"],
    background_color: "#f4f4f4",
    theme_color: "#111111",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        // maskable: o Android recorta em círculo; o desenho já foi
        // reduzido a 62% para caber na zona segura.
        purpose: "maskable",
      },
    ],
  };
}
