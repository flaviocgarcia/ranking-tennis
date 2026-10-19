import Link from "next/link";
import { clubName } from "@/lib/env";

/**
 * Layout das páginas PÚBLICAS.
 *
 * Importante: este subtree não lê cookies()/headers(), o que mantém
 * home, regras e rankings estáticos (cache na CDN, zero invocations
 * por visita ao site público).
 */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link href="/" className="brand">
            <span className="mark">🎾</span>
            {clubName()}
          </Link>
          <nav className="nav">
            <Link href="/">Início</Link>
            <Link href="/rankings">Classificações</Link>
            <Link href="/results">Resultados</Link>
            <Link href="/rules">Regras</Link>
            <Link href="/login" className="subtle">
              Área do jogador
            </Link>
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
      <footer className="site-footer">
        <div className="container inner">
          <span>
            {clubName()} — classificação oficial de tênis
          </span>
          <span>
            <Link href="/rules">Regras dos rankings</Link> ·{" "}
            <Link href="/rankings">Classificações</Link> ·{" "}
            <Link href="/results">Resultados</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
