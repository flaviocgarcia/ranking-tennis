import type { Metadata } from "next";
import Link from "next/link";
import { listPublicLevels } from "@/lib/queries/levels";
import { listPublicConfirmedMatches } from "@/lib/queries/matches";
import { hydrateNames } from "@/lib/queries/players";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import {
  playerIdsOf,
  toResultRows,
  type ResultViewRow,
} from "@/lib/results/view";
import { formatDate, scoreText } from "@/lib/format";
import { MATCH_FORMAT_LABELS } from "@/lib/domain/challenger";
import { DataTable } from "@/components/DataTable";

export const metadata: Metadata = {
  title: "Resultados",
  description: "Partidas confirmadas de todos os níveis.",
};

/** Quantidade de jogos mais recentes exibidos na página geral. */
const RECENT_LIMIT = 60;

interface LevelBrief {
  id: string;
  code: string;
  slug: string;
  name: string;
}

interface PageData {
  kind: "ok" | "error";
  levels: LevelBrief[];
  rows: ResultViewRow[];
}

/**
 * Lista pública de jogos — PÁGINA ESTÁTICA (como `/rankings`).
 *
 * Consultas apenas na build/revalidação: níveis (1) + partidas confirmadas
 * (1) + hidratação de nomes em blocos de ≤100 ids (≤2 aqui). Nada por visita,
 * nenhum cron, nenhum polling. Pendentes e rejeitadas nem saem do banco
 * (política da migration 0003).
 */
async function loadPage(): Promise<PageData> {
  try {
    const anon = createSupabaseAnon();
    const [levels, matches] = await Promise.all([
      listPublicLevels(anon),
      listPublicConfirmedMatches(anon, { limit: RECENT_LIMIT }),
    ]);
    const names = await hydrateNames(anon, playerIdsOf(matches));
    return { kind: "ok", levels, rows: toResultRows(matches, names, levels) };
  } catch (e) {
    console.error("[results] falha ao carregar:", e);
    return { kind: "error", levels: [], rows: [] };
  }
}

export default async function PublicResultsPage() {
  const data = await loadPage();

  if (data.kind === "error") {
    return (
      <>
        <h1 className="page-title">Resultados</h1>
        <div className="card">
          <p className="muted">
            Não foi possível carregar os resultados agora. Tente novamente em
            instantes.
          </p>
        </div>
      </>
    );
  }

  const truncated = data.rows.length === RECENT_LIMIT;

  return (
    <>
      <h1 className="page-title">Resultados</h1>
      <p className="page-sub">
        Partidas <strong>confirmadas</strong> — veja também as{" "}
        <Link href="/rankings">classificações</Link> e as{" "}
        <Link href="/rules">regras</Link>.
      </p>

      <p className="mt">
        <Link href="/results">Todos</Link>
        {data.levels.map((l) => (
          <span key={l.id}>
            {" · "}
            <Link href={`/results/${l.slug}`}>{l.name}</Link>
          </span>
        ))}
      </p>

      {data.rows.length === 0 ? (
        <div className="card mt">
          <p className="muted">Nenhuma partida confirmada até o momento.</p>
        </div>
      ) : (
        <DataTable className="mt" searchPlaceholder="Buscar por atleta...">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th className="col-sm">Formato</th>
                <th>Jogadores</th>
                <th>Placar</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.playedOn)}</td>
                  <td className="col-sm">{MATCH_FORMAT_LABELS[m.format]}</td>
                  <td data-sort={`${m.p1} ${m.p2}`}>
                    <span className="small">
                      <strong
                        className={
                          m.winner === "p1" ? "res-win" : m.winner ? "res-loss" : undefined
                        }
                      >
                        {m.p1}
                      </strong>{" "}
                      <span className="muted">x</span>{" "}
                      <strong
                        className={
                          m.winner === "p2" ? "res-win" : m.winner ? "res-loss" : undefined
                        }
                      >
                        {m.p2}
                      </strong>
                    </span>
                  </td>
                  <td>
                    <strong>
                      {m.format === "walkover"
                        ? `W.O. (${m.winner === "p1" ? m.p1 : m.p2})`
                        : scoreText(m.sets)}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      <p className="muted small mt center">
        {truncated
          ? `Exibindo as ${RECENT_LIMIT} partidas mais recentes`
          : `${data.rows.length} partida${data.rows.length === 1 ? "" : "s"}`}{" "}
        · <Link href="/results">Ver por nível</Link>
      </p>
    </>
  );
}
