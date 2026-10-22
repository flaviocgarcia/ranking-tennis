import Link from "next/link";
import type { Metadata } from "next";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { countMatchesByStatus } from "@/lib/queries/matches";
import { getLevelAdmin } from "@/lib/queries/levels";

export const metadata: Metadata = { title: "Painel administrativo" };

/**
 * Visão geral com contagens baratas (head counts), sem varreduras.
 * Administrador de nível vê apenas os números do próprio nível.
 */
export default async function AdminHomePage() {
  const info = await requireAdmin();
  const scope = adminScope(info);
  const supabase = await createSupabaseServer();

  const level = scope ? await getLevelAdmin(supabase, scope) : null;

  const playersQuery = supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("pending_approval", false);
  const pendingQuery = supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("pending_approval", true);

  const [counts, playersRes, pendingRes] = await Promise.all([
    countMatchesByStatus(supabase, scope),
    scope ? playersQuery.eq("level_id", scope) : playersQuery,
    scope ? pendingQuery.eq("level_id", scope) : pendingQuery,
  ]);

  return (
    <>
      <h1 className="page-title">
        {scope ? `Painel · ${level?.name ?? "seu nível"}` : "Painel administrativo"}
      </h1>
      <p className="page-sub">
        {scope
          ? "Você administra somente este nível: jogadores e resultados dele."
          : "Controle de resultados, convites e jogadores."}
      </p>

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <span className="value" style={{ color: counts.pending > 0 ? "var(--warn)" : undefined }}>
              {counts.pending}
            </span>
            <span className="label">Resultados pendentes</span>
          </div>
          <div className="stat">
            <span className="value">{counts.confirmed}</span>
            <span className="label">Confirmados</span>
          </div>
          <div className="stat">
            <span className="value">{playersRes.count ?? 0}</span>
            <span className="label">Jogadores ativos</span>
          </div>
          <div className="stat">
            <Link href="/admin/players?pending=1">
              <span
                className="value"
                style={{
                  color: (pendingRes.count ?? 0) > 0 ? "var(--warn)" : undefined,
                  display: "block",
                }}
              >
                {pendingRes.count ?? 0}
              </span>
            </Link>
            <span className="label">Aguardando aprovação</span>
          </div>
        </div>
        <p className="mt row-actions">
          <Link href="/admin/results?status=pending" className="btn">
            Revisar pendentes
          </Link>
          <Link href="/admin/results/new" className="btn btn-secondary">
            Lançar resultado
          </Link>
          <Link href="/admin/players/new" className="btn btn-secondary">
            Cadastrar jogador
          </Link>
          {(pendingRes.count ?? 0) > 0 && (
            <Link href="/admin/players?pending=1" className="btn btn-secondary">
              Aprovar cadastros
            </Link>
          )}
        </p>
      </div>

      <div className="grid">
        <Link href="/admin/results" className="link-card">
          <div className="title">Resultados</div>
          <div className="desc">Confirmar, corrigir, rejeitar ou excluir partidas.</div>
        </Link>
        <a href="/admin/results/export" className="link-card">
          <div className="title">Exportar planilha</div>
          <div className="desc">
            Baixe todos os resultados confirmados em CSV, com a pontuação
            atribuída a cada jogador — um backup completo.
          </div>
        </a>
        {!scope && (
          <Link href="/admin/convites" className="link-card">
            <div className="title">Convites e ativação</div>
            <div className="desc">
              Pré-cadastrados do torneio: gerar códigos de ativação para os
              atletas criarem a própria conta.
            </div>
          </Link>
        )}
        <Link href="/admin/players" className="link-card">
          <div className="title">Jogadores</div>
          <div className="desc">
            Cadastrar contas, aprovar cadastros, definir nível e redefinir
            senhas.
          </div>
        </Link>
        <Link href="/admin/verify" className="link-card">
          <div className="title">Verificar consistência</div>
          <div className="desc">
            Recalcula a partir dos resultados oficiais e compara com o publicado.
          </div>
        </Link>
      </div>
    </>
  );
}
