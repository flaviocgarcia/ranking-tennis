import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicLevelBySlug, listPublicLevels } from "@/lib/queries/levels";
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
import type { LevelRow } from "@/types/db";

/**
 * Lista pública de jogos de um nível — ESTÁTICA (gerada na build ou na
 * primeira visita) e atualizada somente por revalidatePath quando um
 * resultado é confirmado/corrigido/removido ou a configuração muda.
 * Nenhuma consulta por visita, nenhum cron, nenhum polling.
 */

/** Máximo de partidas exibidas por nível (a build consulta uma única vez). */
const LEVEL_LIMIT = 500;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const levels = await listPublicLevels(createSupabaseAnon());
    return levels.map((l) => ({ slug: l.slug }));
  } catch {
    // Sem banco na build: as páginas serão geradas sob demanda.
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const level = await getPublicLevelBySlug(createSupabaseAnon(), slug);
    if (!level) return { title: "Resultados" };
    return {
      title: `Resultados — ${level.name}`,
      description: `Partidas confirmadas do nível ${level.name}.`,
    };
  } catch {
    return { title: "Resultados" };
  }
}

async function loadData(slug: string): Promise<
  | { kind: "error" }
  | { kind: "notfound" }
  | {
      kind: "ok";
      level: LevelRow;
      rows: ResultViewRow[];
      truncated: boolean;
    }
> {
  try {
    const anon = createSupabaseAnon();
    const level = await getPublicLevelBySlug(anon, slug);
    if (!level) return { kind: "notfound" };

    const matches = await listPublicConfirmedMatches(anon, {
      levelId: level.id,
      limit: LEVEL_LIMIT,
    });
    // Hidratação de nomes em blocos de ≤100 ids (nunca 1 por partida).
    const names = await hydrateNames(anon, playerIdsOf(matches));
    return {
      kind: "ok",
      level,
      rows: toResultRows(matches, names, [level]),
      truncated: matches.length === LEVEL_LIMIT,
    };
  } catch (e) {
    console.error("[results] falha ao carregar:", e);
    return { kind: "error" };
  }
}

export default async function PublicLevelResultsPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadData(slug);

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
  if (data.kind === "notfound") notFound();

  const { level, rows, truncated } = data;

  return (
    <>
      <h1 className="page-title">
        Resultados <span className="muted small">({level.name})</span>
      </h1>
      <p className="page-sub">
        Partidas <strong>confirmadas</strong> · Normal: melhor de 3 (3º set =
        tiebreakão a 10) · Grand Slam: melhor de 5 ·{" "}
        <Link href={`/rankings/${level.slug}`}>Ver classificação</Link>
      </p>

      <p className="mt">
        <Link href="/results">Todos</Link>
        <span>
          {" · "}
          <strong>{level.name}</strong>
        </span>
      </p>

      {rows.length === 0 ? (
        <div className="card mt">
          <p className="muted">
            Nenhuma partida confirmada neste nível até o momento.
          </p>
        </div>
      ) : (
        <DataTable className="mt" searchPlaceholder="Buscar por atleta...">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Jogadores</th>
                <th>Placar</th>
                <th className="col-sm">Formato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.playedOn)}</td>
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
                  <td className="col-sm">{MATCH_FORMAT_LABELS[m.format]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      <p className="muted small mt center">
        {truncated ? (
          <>Exibindo as {LEVEL_LIMIT} partidas mais recentes</>
        ) : (
          <>
            {rows.length} partida{rows.length === 1 ? "" : "s"} confirmada
            {rows.length === 1 ? "" : "s"}
          </>
        )}{" "}
        · <Link href={`/rankings/${level.slug}`}>Classificação</Link> ·{" "}
        <Link href="/results">Todos os níveis</Link>
      </p>
    </>
  );
}
