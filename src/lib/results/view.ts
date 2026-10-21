/**
 * Montagem da LISTA PÚBLICA de jogos (/results e /results/[slug]).
 *
 * Funções puras: recebem as linhas já buscadas (colunas mínimas, apenas
 * confirmadas) + os nomes hidratados em blocos e devolvem o que a tabela
 * renderiza. Nenhuma consulta aqui — a economia vive em `src/lib/queries`.
 */
import { matchVerdict } from "@/lib/format";
import type { MatchFormat } from "@/lib/domain/challenger";
import type { PublicMatchRow } from "@/lib/queries/matches";
import type { ScoreSet } from "@/lib/domain/config";

export interface ResultViewRow {
  id: string;
  playedOn: string;
  level: { slug: string; name: string; code: string } | null;
  /** Nome exibido ("?" quando o jogador está inativo e fora da leitura pública). */
  p1: string;
  p2: string;
  sets: ScoreSet[];
  /** Normal (melhor de 3), Grand Slam (melhor de 5) ou W.O. */
  format: MatchFormat;
  winner: "p1" | "p2" | null;
}

export type NameMap = Map<string, { name: string; initials: string }>;

interface LevelBrief {
  id: string;
  code: string;
  slug: string;
  name: string;
}

/**
 * Converte as partidas em linhas de exibição.
 * O vencedor é destacado com `<strong>` na tabela (mesma leitura do painel).
 */
export function toResultRows(
  matches: PublicMatchRow[],
  names: NameMap,
  levels: LevelBrief[] = [],
): ResultViewRow[] {
  const levelById = new Map(levels.map((l) => [l.id, l]));
  return matches.map((m) => {
    const level = levelById.get(m.level_id) ?? null;
    return {
      id: m.id,
      playedOn: m.played_on,
      level: level ? { slug: level.slug, name: level.name, code: level.code } : null,
      p1: names.get(m.player1_id)?.name ?? "?",
      p2: names.get(m.player2_id)?.name ?? "?",
      sets: m.sets,
      format: m.format,
      winner: matchVerdict(m.format, m.walkover_winner, m.sets),
    };
  });
}

/** Todos os ids de jogador de uma lista de partidas (para hidratar uma vez). */
export function playerIdsOf(matches: PublicMatchRow[]): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m.player1_id);
    ids.add(m.player2_id);
  }
  return [...ids];
}
