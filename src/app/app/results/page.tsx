import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listMyMatches } from "@/lib/queries/matches";
import { WithdrawButton } from "@/components/WithdrawButton";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { formatDate, scoreText } from "@/lib/format";
import { MATCH_FORMAT_LABELS } from "@/lib/domain/challenger";

export const metadata: Metadata = { title: "Meus resultados" };

const PAGE_SIZE = 10;

/** Histórico do jogador — paginado no servidor (nunca o histórico completo). */
export default async function MyResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const info = await requireUser();
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);

  const supabase = await createSupabaseServer();
  const { rows, count } = await listMyMatches(supabase, info.userId, page, PAGE_SIZE);

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title">Meus resultados</h1>
        <Link href="/app/results/new" className="btn">
          + Novo resultado
        </Link>
      </div>
      <p className="page-sub">
        {count} registro{count === 1 ? "" : "s"}
        {pendingCount > 0 && (
          <>
            {" "}
            · <strong>{pendingCount}</strong> pendente
            {pendingCount === 1 ? "" : "s"} nesta página
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <div className="card">
          <p className="empty">
            Nenhum resultado ainda.{" "}
            <Link href="/app/results/new">Informe seu primeiro</Link>.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Formato</th>
                <th>Adversário</th>
                <th>Placar</th>
                <th className="col-sm">Fonte</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const isP1 = m.player1_id === info.userId;
                const opponent = isP1 ? m.p2 : m.p1;
                const canWithdraw =
                  m.status === "pending" && m.reported_by === info.userId;
                return (
                  <tr key={m.id}>
                    <td>{formatDate(m.played_on)}</td>
                    <td>{MATCH_FORMAT_LABELS[m.format]}</td>
                    <td>
                      <span className="player-cell">
                        <Avatar initials={(opponent?.name ?? "?").slice(0, 2).toUpperCase()} />
                        {opponent?.name ?? "?"}
                      </span>
                    </td>
                    <td>
                      {m.format === "walkover"
                        ? `W.O. (${
                            m.walkover_winner === (isP1 ? 1 : 2)
                              ? "você"
                              : opponent?.name ?? "?"
                          })`
                        : scoreText(m.sets)}
                    </td>
                    <td className="col-sm muted small">
                      {m.source === "telegram" ? "Telegram" : "Site"}
                    </td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                    <td>
                      {canWithdraw && <WithdrawButton id={m.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={count}
        basePath="/app/results"
      />
    </>
  );
}
