import Link from "next/link";
import type { Metadata } from "next";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listLevelsAdmin } from "@/lib/queries/levels";
import { listMatchesAdmin } from "@/lib/queries/matches";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { MatchAdminActions } from "@/components/MatchAdminActions";
import { formatDate, scoreText } from "@/lib/format";
import { MATCH_FORMAT_LABELS } from "@/lib/domain/challenger";
import type { MatchStatus } from "@/types/db";

export const metadata: Metadata = { title: "Resultados" };

const PAGE_SIZE = 15;

const STATUS_LABEL: Record<MatchStatus, string> = {
  pending: "Pendentes",
  confirmed: "Confirmados",
  rejected: "Rejeitados",
};

/**
 * Resultados (admin) — lista paginada com filtros no servidor.
 * Uma única consulta com joins embutidos (nível + jogadores), sem N+1.
 */
export default async function AdminResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; level?: string }>;
}) {
  const info = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const statusRaw = (sp.status ?? "").trim();
  const status = (
    ["pending", "confirmed", "rejected"].includes(statusRaw) ? statusRaw : ""
  ) as "" | MatchStatus;
  // Administrador de nível só enxerga resultados do próprio nível.
  const scope = adminScope(info);
  const levelId = scope ?? (sp.level ?? "").trim();

  const supabase = await createSupabaseServer();
  const [allLevels, results] = await Promise.all([
    listLevelsAdmin(supabase),
    listMatchesAdmin(supabase, {
      levelId: levelId || undefined,
      status: status || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const levels = scope ? allLevels.filter((l) => l.id === scope) : allLevels;

  return (
    <>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title">Resultados</h1>
        <div className="row-actions">
          <a href="/admin/results/export" className="btn btn-secondary">
            Exportar planilha
          </a>
          <Link href="/admin/results/new" className="btn">
            + Lançar resultado
          </Link>
        </div>
      </div>
      <p className="page-sub">
        Resultados informados por jogadores ficam pendentes até confirmação.
        Confirmar recalcula e republica somente o ranking afetado. A planilha
        traz todos os resultados confirmados com as pontuações de cada partida.
      </p>

      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="status">Situação</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="">Todas</option>
            <option value="pending">{STATUS_LABEL.pending}</option>
            <option value="confirmed">{STATUS_LABEL.confirmed}</option>
            <option value="rejected">{STATUS_LABEL.rejected}</option>
          </select>
        </div>
        {!scope && (
          <div className="field">
            <label htmlFor="level">Nível</label>
            <select id="level" name="level" defaultValue={levelId}>
              <option value="">Todos</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-secondary" type="submit">
          Filtrar
        </button>
      </form>

      {results.rows.length === 0 ? (
        <div className="card">
          <p className="muted">Nenhum resultado encontrado.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th className="col-sm">Formato</th>
                <th>Jogadores</th>
                <th>Placar</th>
                <th className="col-sm">Fonte</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {results.rows.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.played_on)}</td>
                  <td className="col-sm">{MATCH_FORMAT_LABELS[m.format]}</td>
                  <td>
                    <span className="small">
                      {m.p1?.name ?? "?"} <span className="muted">x</span>{" "}
                      {m.p2?.name ?? "?"}
                    </span>
                  </td>
                  <td>
                    <strong>
                      {m.format === "walkover"
                        ? `W.O. (${m.walkover_winner === 1 ? m.p1?.name ?? "?" : m.p2?.name ?? "?"})`
                        : scoreText(m.sets)}
                    </strong>
                  </td>
                  <td className="col-sm muted small">
                    {m.source === "telegram"
                      ? "Telegram"
                      : m.source === "admin"
                        ? "Admin"
                        : "Site"}
                  </td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>
                    <MatchAdminActions id={m.id} status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={results.count}
        basePath="/admin/results"
        query={{ status, level: scope ? "" : levelId }}
      />
    </>
  );
}
