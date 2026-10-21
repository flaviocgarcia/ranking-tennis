import Link from "next/link";
import { RankingTable } from "@/components/RankingTable";
import { formatDateTime } from "@/lib/format";
import type { PublicRanking } from "@/lib/ranking/public";

/**
 * Painel de exibição da classificação (título, links, tabela e rodapé
 * com janela/atualização) — usado em /rankings e /rankings/[slug].
 */
export function RankingPanel({ data }: { data: PublicRanking }) {
  const { level, rows, computedAt, matchesCount, windowFrom } = data;

  return (
    <>
      <h1 className="page-title">
        {level.name} <span className="muted small">({level.code})</span>
      </h1>
      <p className="page-sub">
        <Link href="/rules">Regulamento</Link> ·{" "}
        <Link href={`/results/${level.slug}`}>Resultados</Link> ·{" "}
        Normal (melhor de 3) e Grand Slam (melhor de 5) · só contam jogos dos
        últimos 12 meses
      </p>

      <RankingTable rows={rows} />

      <p className="muted small mt center">
        {matchesCount} partida{matchesCount === 1 ? "" : "s"} confirmada
        {matchesCount === 1 ? "" : "s"} no histórico · pontuam apenas as
        partidas a partir de {windowFrom} · atualizado em{" "}
        {formatDateTime(computedAt ?? "")}
      </p>
    </>
  );
}
