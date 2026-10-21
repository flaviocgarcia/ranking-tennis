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
          <div className="brand-group">
            <Link href="/" className="brand">
              <img src="/logo-challenge.png" width={30} height={30} alt="" className="brand-logo" />
              {clubName()}
            </Link>
            <Link href="/app" className="btn btn-sm">
              Área do jogador
            </Link>
          </div>
          <nav className="nav">
            <Link href="/">Início</Link>
            <Link href="/rankings">Classificação</Link>
            <Link href="/results">Resultados</Link>
            <Link href="/atletas">Atletas</Link>
            <Link href="/agenda">Agenda</Link>
            <Link href="/rules">Regulamento</Link>
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
      <footer className="site-footer">
        <div className="container inner">
          <span>
            {clubName()} — classificação oficial do F CHALLENGER
          </span>
          <span>
            <Link href="/rules">Regulamento</Link> ·{" "}
            <Link href="/rankings">Classificação</Link> ·{" "}
            <Link href="/results">Resultados</Link> ·{" "}
            <Link href="/atletas">Atletas</Link> ·{" "}
            <Link href="/agenda">Agenda</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
