import type { Metadata, Viewport } from "next";
import "./globals.css";
import { clubName, siteUrl } from "@/lib/env";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${clubName()} — Ranking de Tênis`,
    template: `%s · ${clubName()}`,
  },
  description:
    "Classificação oficial de tênis: resultados informados pelos jogadores, confirmados pelo administrador e rankings publicados.",
  // Sem ícones externos: favicon é SVG embutido (ver /icon.svg).
  applicationName: `${clubName()} — Ranking de Tênis`,
  // Metas do iOS: "Adicionar à Tela de Início" vira app em tela cheia
  // (sem isso o Safari não recebe notificações, mesmo com o site instalado).
  appleWebApp: {
    capable: true,
    title: clubName(),
    statusBarStyle: "default",
  },
  // O Next emite "mobile-web-app-capable" (padrão W3C); o iOS Safari
  // também consulta a variação apple-*, então declaramos as duas.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Cor da barra do navegador/instalação — mesma do --accent.
  themeColor: "#157a4b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
