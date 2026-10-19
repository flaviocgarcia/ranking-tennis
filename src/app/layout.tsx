import type { Metadata } from "next";
import "./globals.css";
import { clubName, siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${clubName()} — Ranking de Tênis`,
    template: `%s · ${clubName()}`,
  },
  description:
    "Classificação oficial de tênis: resultados informados pelos jogadores, confirmados pelo administrador e rankings publicados.",
  // Sem ícones externos: favicon é SVG embutido (ver /icon.svg).
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
