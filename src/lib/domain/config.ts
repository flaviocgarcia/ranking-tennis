/**
 * Tipos de domínio e configuração de um nível (categoria) de ranking.
 *
 * Tudo que é regrado pelo administrador (formato da partida, pontuação e
 * desempate) vive em `LevelConfig`, persistido em `levels.config` (JSONB).
 * Nenhum desses valores é "hard-coded" nas páginas.
 */

/** Placar de um set: [pontos do jogador 1, pontos do jogador 2]. */
export type ScoreSet = [number, number];

export type TiebreakKey =
  | "wins"
  | "head_to_head"
  | "set_diff"
  | "game_diff";

/** Ordem de exibição/documentação dos critérios de desempate. */
export const TIEBREAK_LABELS: Record<TiebreakKey, string> = {
  wins: "Vitórias",
  head_to_head: "Confronto direto",
  set_diff: "Saldo de sets",
  game_diff: "Saldo de games",
};

export const TIEBREAK_ORDER: TiebreakKey[] = [
  "wins",
  "head_to_head",
  "set_diff",
  "game_diff",
];

export interface LevelConfig {
  /**
   * Sets necessários para vencer a partida. Ex.: 2 => "melhor de 3".
   * O set decisivo (ambos a 1 set) é o "tiebreakão" quando habilitado.
   */
  setsToWin: number;
  /** Tiebreakão (super tiebreak) no set decisivo. */
  superTiebreak: {
    enabled: boolean;
    /** Pontos para vencer (ex.: 10), sempre com vantagem de 2. */
    points: number;
  };
  /**
   * Pontuação por resultado.
   * - winStraight: vitória por 2x0 (sem ceder set)
   * - winExtended: vitória com um set cedido (ex.: 2x1 com tiebreakão)
   * - loss: pontos do perdedor
   * - deciderLoserPoint: quando a partida foi decidida no tiebreakão, o
   *   perdedor ganha 1 ponto (padrão: ligado)
   */
  scoring: {
    winStraight: number;
    winExtended: number;
    loss: number;
    deciderLoserPoint: boolean;
  };
  /** Lista ordenada de critérios de desempate aplicados após os pontos. */
  tiebreakers: TiebreakKey[];
}

/** Padrão: 2 sets + tiebreakão de 10, 3 pts por 2x0, 2 pts por 2x1. */
export const DEFAULT_LEVEL_CONFIG: LevelConfig = {
  setsToWin: 2,
  superTiebreak: { enabled: true, points: 10 },
  scoring: {
    winStraight: 3,
    winExtended: 2,
    loss: 0,
    deciderLoserPoint: true,
  },
  tiebreakers: ["wins", "head_to_head", "set_diff", "game_diff"],
};

/**
 * Linha final de uma classificação (chaves curtas = JSON compacto).
 *
 * O snapshot guarda APENAS números + id do jogador. Nome e iniciais são
 * hidratados de `profiles` na renderização (uma única consulta), o que
 * evita duplicar dados e divergirem quando o nome muda.
 */
export interface RankingEntry {
  /** Posição (1-based). */
  pos: number;
  id: string;
  /** Pontos. */
  pts: number;
  /** Vitórias. */
  w: number;
  /** Derrotas. */
  l: number;
  /** Sets vencidos / perdidos. */
  sw: number;
  sl: number;
  /** Games vencidos / perdidos. */
  gw: number;
  gl: number;
  /** Partidas disputadas. */
  mp: number;
}

/** Snapshot publicado de um ranking. */
export interface RankingSnapshotData {
  entries: RankingEntry[];
  /** Quantidade de partidas confirmadas usadas no cálculo. */
  mc: number;
  /** ISO timestamp do cálculo. */
  at: string;
}
