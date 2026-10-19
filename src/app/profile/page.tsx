import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getLevelAdmin } from "@/lib/queries/levels";
import { TelegramCodeForm } from "@/components/TelegramCodeForm";
import { adminAvailable, createSupabaseAdmin } from "@/lib/supabase/admin";
import { NameForm, PasswordForm } from "@/components/ProfileForms";
import { clubName } from "@/lib/env";

export const metadata: Metadata = { title: "Perfil" };

/**
 * Perfil do jogador (fora de /app de propósito: o layout /app redireciona
 * para cá enquanto a senha temporária não for definida, sem laço).
 */
export default async function ProfilePage() {
  const info = await requireUser();
  const supabase = await createSupabaseServer();
  const { profile } = info;

  const level = profile.level_id
    ? await getLevelAdmin(supabase, profile.level_id)
    : null;

  // `telegram_link_code` é coluna privada (grant por coluna, ver 0002_rls.sql):
  // só a chave de service lê, aqui no servidor. Sem a chave configurada, o
  // jogador obtém um código novo pelo botão abaixo.
  let linkCode: string | null = null;
  if (adminAvailable()) {
    const { data } = await createSupabaseAdmin()
      .from("profiles")
      .select("telegram_link_code")
      .eq("id", profile.id)
      .maybeSingle();
    linkCode = data?.telegram_link_code ?? null;
  }

  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link href="/" className="brand">
            <span className="mark">🎾</span>
            {clubName()}
          </Link>
          <nav className="nav">
            <Link href="/app">← Painel</Link>
          </nav>
        </div>
      </header>

      <main className="container">
        <h1 className="page-title">Meu perfil</h1>

        {profile.must_change_password && (
          <div className="alert alert-warn">
            Você entrou com uma senha temporária. Defina a sua própria senha
            para continuar usando o sistema normalmente.
          </div>
        )}

        {profile.pending_approval && (
          <div className="alert alert-warn">
            Seu cadastro aguarda aprovação do administrador. Você ainda não
            aparece no ranking e não pode informar resultados.
          </div>
        )}

        <section className="card">
          <h2>Senha</h2>
          <PasswordForm mustChange={profile.must_change_password} />
        </section>

        <section className="card">
          <h2>Meus dados</h2>
          <p className="muted small">
            E-mail: {info.email ?? "—"} · Nível: {level?.name ?? "não atribuído"} ·
            Perfil: {profile.role === "admin" ? "administrador" : "jogador"}
          </p>
          <NameForm initialName={profile.name} />
        </section>

        <section className="card">
          <h2>Telegram (opcional)</h2>
          <p className="muted small">
            Use o chatbot para consultar o ranking e registrar resultados pelo
            celular. Para vincular, envie no bot:{" "}
            <strong>/vincular {linkCode ?? "SEU-CÓDIGO"}</strong> — se ainda não
            tem um, gere abaixo.
          </p>
          <div className="row-actions">
            <span className="badge badge-confirmed">
              Código: {linkCode ?? "não gerado"}
            </span>
            <TelegramCodeForm />
          </div>
          <p className="muted small mt">
            Comandos: /ranking, /meus, /registrar JOGADOR 6-4 7-5. Para
            desvincular: /desvincular. Sem o token configurado no servidor, o
            bot fica desligado e nada muda no site.
          </p>
        </section>
      </main>
    </>
  );
}
