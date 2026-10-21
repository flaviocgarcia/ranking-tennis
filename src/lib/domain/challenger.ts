import type { LevelConfig, ScoreSet } from "./config";
import { validateMatchScore } from "./match";

/**
 * Regras do F CHALLENGER (fonte: planilha "F CHALLENGER R25",
 * abas REGULAMENTO e GRAND SLAM).
 *
 * - NORMAL: melhor de 3; o 3º set (empate 1-1) é normalmente o
 *   tiebreakão até 10 — placar de set comum também é aceito nos jogos
 *   registrados (os dois formatos pontuam igual).
 * - GRAND SLAM: melhor de 5, SEM tiebreakão; só termina quando um
 *   jogador fecha 3 sets, no mesmo dia e sem interrupções longas
 *   (última parte é orientação de uso, não validável).
 * - W.O.: um jogador não apareceu sem avisar — 300/0 e o vencedor é
 *   declarado (quem compareceu).
 * - Máximo de 2 partidas por semestre contra o mesmo adversário
 *   (2025, ano de estreia, vale 1).
 * - Os pontos de uma partida caducam ao completar 1 ano.
 */

export type MatchFormat = "normal" | "grand_slam" | "walkover";

export const MATCH_FORMATS: MatchFormat[] = ["normal", "grand_slam", "walkover"];

export const MATCH_FORMAT_LABELS: Record<MatchFormat, string> = {
  normal: "Normal",
  grand_slam: "Grand Slam",
  walkover: "W.O.",
};

/** Configuração de validação do set/placar por formato (a pontuação é nossa). */
export const FORMAT_CONFIG: Record<Exclude<MatchFormat, "walkover">, LevelConfig> = {
  normal: {
    setsToWin: 2,
    superTiebreak: { enabled: true, points: 10 },
    scoring: { winStraight: 300, winExtended: 200, loss: 50, deciderLoserPoint: true },
    tiebreakers: [],
  },
  grand_slam: {
    setsToWin: 3,
    superTiebreak: { enabled: false, points: 0 },
    scoring: { winStraight: 450, winExtended: 450, loss: 75, deciderLoserPoint: false },
    tiebreakers: [],
  },
};

/** Máximo de sets de um formato (para o formulário). */
export function maxSetsFor(format: MatchFormat): number {
  if (format === "normal") return 3;
  if (format === "grand_slam") return 5;
  return 0; // walkover não tem sets
}

export interface ChallengerResult {
  ok: true;
  winner: "p1" | "p2";
  winnerSets: number;
  loserSets: number;
}

export interface ChallengerInvalid {
  ok: false;
  error: string;
}

/**
 * Valida o placar de uma partida NORMAL ou GRAND SLAM.
 * (W.O. não passa por aqui: não tem placar.)
 */
export function validateChallengerScore(
  sets: ScoreSet[],
  format: Exclude<MatchFormat, "walkover">,
): ChallengerResult | ChallengerInvalid {
  const config = FORMAT_CONFIG[format];
  const v = validateMatchScore(sets, config);
  if (!v.ok) {
    if (format === "grand_slam" && sets.length > 0 && sets.length < 3) {
      return {
        ok: false,
        error:
          "Grand Slam é melhor de 5: a partida só termina quando um jogador fecha 3 sets.",
      };
    }
    return { ok: false, error: v.error };
  }
  return {
    ok: true,
    winner: v.winner,
    winnerSets: v.winnerSets,
    loserSets: v.loserSets,
  };
}

/**
 * Pontos da partida para OS DOIS lados, conforme as regras:
 *
 * | Formato     | Vencedor            | Perdedor               |
 * |-------------|---------------------|------------------------|
 * | Normal      | 2x0 = 300 · 2x1 = 200 | 0 sets = 50 · 1 set = 100 |
 * | Grand Slam  | sempre 450          | sempre 75              |
 * | W.O.        | 300                 | 0                      |
 */
export function matchPoints(
  format: MatchFormat,
  result: { winner: "p1" | "p2"; winnerSets: number; loserSets: number },
): { p1: number; p2: number } {
  if (format === "walkover") {
    return result.winner === "p1" ? { p1: 300, p2: 0 } : { p1: 0, p2: 300 };
  }
  if (format === "grand_slam") {
    return result.winner === "p1"
      ? { p1: 450, p2: 75 }
      : { p1: 75, p2: 450 };
  }
  const winner = result.loserSets === 0 ? 300 : 200;
  const loser = result.loserSets === 0 ? 50 : 100;
  return result.winner === "p1"
    ? { p1: winner, p2: loser }
    : { p1: loser, p2: winner };
}

// ------------------------------------------------------------
// Semestre (limite de 2 partidas por adversário)
// ------------------------------------------------------------

/** Identificador do semestre de uma data: "2025" | "2026-S1" | "2026-S2". */
export function semesterKey(playedOn: string): string {
  const year = Number(playedOn.slice(0, 4));
  if (year <= 2025) return "2025"; // ano de estreia (nov/dez/2025)
  const month = Number(playedOn.slice(5, 7));
  return month <= 6 ? `${year}-S1` : `${year}-S2`;
}

/** Limite de partidas contra o MESMO adversário no semestre. */
export function semesterLimit(key: string): number {
  return key === "2025" ? 1 : 2;
}

/** Intervalo de datas [from, to] de um semestre (para contagem). */
export function semesterRange(key: string): { from: string; to: string } {
  if (key === "2025") return { from: "2025-01-01", to: "2025-12-31" };
  const year = key.slice(0, 4);
  return key.endsWith("S1")
    ? { from: `${year}-01-01`, to: `${year}-06-30` }
    : { from: `${year}-07-01`, to: `${year}-12-31` };
}

// ------------------------------------------------------------
// Janela de 12 meses (pontos caducam ao completar 1 ano)
// ------------------------------------------------------------

/** Data mínima (inclusive) para uma partida ainda pontuar hoje. */
export function windowStart(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4)) - 1;
  const rest = todayIso.slice(4); // "-MM-DD"
  // 29/02 em ano não bissexto vira 28/02.
  if (rest === "-02-29") {
    const y = year;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${y}${leap ? "-02-29" : "-02-28"}`;
  }
  return `${year}${rest}`;
}

// ------------------------------------------------------------
// Snapshot do ranking (contribuições por partida) + janela na leitura
// ------------------------------------------------------------

/**
 * Contribuição de UMA partida a um jogador: [data, pontos].
 * O snapshot guarda o HISTÓRICO todo; a janela de 12 meses é aplicada
 * na LEITURA — assim os pontos caducam sozinhos, sem cron e sem
 * recálculo no banco.
 */
export type Contribution = [string, number];

export interface ChallengerSnapshotData {
  /** ISO do recálculo. */
  at: string;
  /** Partidas confirmadas usadas no cálculo. */
  mc: number;
  /** Apenas jogadores com ao menos 1 partida confirmada. */
  players: Array<{ id: string; g: Contribution[] }>;
}

/** Linha de partida usada no cálculo. */
export interface ChallengerMatch {
  id: string;
  player1_id: string;
  player2_id: string;
  sets: ScoreSet[];
  format: MatchFormat;
  walkover_winner: 1 | 2 | null;
  played_on: string;
}

export interface ChallengerPlayer {
  id: string;
}

interface ComputeOutcome {
  data: ChallengerSnapshotData;
  invalid: string[];
}

/**
 * Calcula as contribuições de todos os jogadores a partir das partidas
 * confirmadas (função pura, sem consulta ao banco).
 */
export function computeChallengerSnapshot(
  players: ChallengerPlayer[],
  matches: ChallengerMatch[],
): ComputeOutcome {
  const known = new Set(players.map((p) => p.id));
  const contrib = new Map<string, Contribution[]>();
  const invalid: string[] = [];

  for (const m of matches) {
    if (!known.has(m.player1_id) || !known.has(m.player2_id)) {
      invalid.push(m.id);
      continue;
    }

    let result: ChallengerResult;
    if (m.format === "walkover") {
      if (m.walkover_winner !== 1 && m.walkover_winner !== 2) {
        invalid.push(m.id);
        continue;
      }
      result = {
        ok: true,
        winner: m.walkover_winner === 1 ? "p1" : "p2",
        winnerSets: 0,
        loserSets: 0,
      };
    } else {
      const v = validateChallengerScore(
        m.sets,
        m.format as Exclude<MatchFormat, "walkover">,
      );
      if (!v.ok) {
        invalid.push(m.id);
        continue;
      }
      result = v;
    }

    const points = matchPoints(m.format, result);
    const p1 = contrib.get(m.player1_id);
    if (p1) p1.push([m.played_on, points.p1]);
    else contrib.set(m.player1_id, [[m.played_on, points.p1]]);
    const p2 = contrib.get(m.player2_id);
    if (p2) p2.push([m.played_on, points.p2]);
    else contrib.set(m.player2_id, [[m.played_on, points.p2]]);
  }

  // Ordem estável por id (o snapshot é determinístico).
  const list = [...contrib.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, g]) => ({ id, g: g.sort((a, b) => a[0].localeCompare(b[0])) }));

  return {
    data: { at: new Date().toISOString(), mc: matches.length, players: list },
    invalid,
  };
}

/** Pontos/jogos dentro da janela de 12 meses (jogadores com ≥1 jogo). */
export interface WindowRow {
  id: string;
  pts: number;
  games: number;
}

export function applyWindow(
  data: ChallengerSnapshotData,
  startIso: string,
): WindowRow[] {
  const rows: WindowRow[] = [];
  for (const p of data.players) {
    let pts = 0;
    let games = 0;
    for (const [date, value] of p.g) {
      if (date >= startIso) {
        pts += value;
        games += 1;
      }
    }
    if (games > 0) rows.push({ id: p.id, pts, games });
  }
  return rows;
}

/** Linha final pronta para exibição (pos, nome, pontos, jogos, média). */
export interface ChallengerViewRow extends WindowRow {
  pos: number;
  avg: number;
  name: string;
  initials: string;
}

/**
 * Ordena por pontos (desc) e aplica a numeração de posições da
 * planilha (1, 2, 2, 4 — empate compartilha a posição). Entre empatados
 * a ordem de exibição é alfabética (não altera a posição).
 */
export function toViewRows(
  rows: WindowRow[],
  names: Map<string, { name: string; initials: string }>,
): ChallengerViewRow[] {
  const withNames = rows.map((r) => ({
    ...r,
    name: names.get(r.id)?.name ?? "",
    initials: names.get(r.id)?.initials ?? "?",
  }));
  withNames.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const out: ChallengerViewRow[] = [];
  let prevPts: number | null = null;
  let pos = 0;
  for (let i = 0; i < withNames.length; i++) {
    const r = withNames[i];
    if (prevPts === null || r.pts !== prevPts) {
      pos = i + 1;
      prevPts = r.pts;
    }
    out.push({
      pos,
      id: r.id,
      pts: r.pts,
      games: r.games,
      avg: r.games > 0 ? r.pts / r.games : 0,
      name: r.name,
      initials: r.initials,
    });
  }
  return out;
}
