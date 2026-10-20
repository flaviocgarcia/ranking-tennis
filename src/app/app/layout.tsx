import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/SignOutButton";
import { clubName } from "@/lib/env";

/**
 * Layout autenticado. Lê cookies => toda a árvore /app é DINÂMICA
 * (nunca serve resposta de um usuário em cache compartilhado).
 * Forçado a definir senha temporária antes de usar o sistema.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const info = await requireUser();
  if (info.profile.must_change_password) redirect("/profile");

  const isAdmin = info.profile.role === "admin";
  const isPending = info.profile.pending_approval;

  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link href="/app" className="brand">
            <span className="mark">🎾</span>
            {clubName()}
          </Link>
          <nav className="nav">
            <Link href="/app">Início</Link>
            <Link href="/app/results">Resultados</Link>
            <Link href="/app/agenda">Agenda</Link>
            {!isPending && <Link href="/app/results/new">Novo resultado</Link>}
            <Link href="/rankings" className="subtle">
              Classificações
            </Link>
            <Link href="/profile" className="subtle">
              Perfil
            </Link>
            {isAdmin && (
              <Link href="/admin" className="subtle">
                Admin
              </Link>
            )}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
