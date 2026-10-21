import Link from "next/link";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { SignOutButton } from "@/components/SignOutButton";
import { clubName } from "@/lib/env";

/**
 * Layout administrativo (dinâmico). Duas camadas de proteção:
 * sessão obrigatória + perfil admin (requireAdmin) — e no banco as
 * escritas passam pela chave de serviço já autorizada no servidor.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const info = await requireAdmin();
  const scoped = adminScope(info) !== null;

  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <div className="brand-group">
            <Link href="/admin" className="brand">
              <img src="/logo-challenge.png" width={30} height={30} alt="" className="brand-logo" />
              Admin · {clubName()}
            </Link>
            <Link href="/" className="btn btn-sm btn-secondary">
              Área geral
            </Link>
          </div>
          <nav className="nav">
            <Link href="/admin">Painel</Link>
            <Link href="/admin/results">Resultados</Link>
            {!scoped && <Link href="/admin/convites">Convites</Link>}
            <Link href="/admin/players">Jogadores</Link>
            <Link href="/admin/verify">Verificar</Link>
            <Link href="/app" className="subtle">
              Meu painel
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
