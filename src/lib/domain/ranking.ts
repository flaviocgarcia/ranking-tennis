import type {
  LevelConfig,
  RankingEntry,
  ScoreSet,
  TiebreakKey,
} from "./config";
import { loserPoints, validateMatchScore, winnerPoints } from "./match";

/** Partida confirmada no formato mínimo para o cálculo. */
export interface RankingMatch {
  id: string;
  player1_id: string;
  player2_id: string;
  sets: ScoreSet[];
}

export interface RankingPlayer {
  id: string;
  name: string;
  initials: string;
}

interface Stats {
  pts: number;
  w: number;
  l: number;
  sw: number;
  sl: number;
  gw: number;
  gl: number;
  mp: number;
}

export interface ComputeResult {
  entries: RankingEntry[];
  /** IDs de partidas confirmadas que foram ignoradas por placar inválido. */
  invalid: string[];
}

function emptyStats(): Stats {
  return { pts: 0, w: 0, l: 0, sw: 0, sl: 0, gw: 0, gl: 0, mp: 0 };
}

/**
 * Calcula a classificação de um nível em uma única operação lógica.
 *
 * - Recebe todos os jogadores e todas as partidas confirmadas do nível
 *   (já buscados em consultas paginadas/limitadas pelo chamador).
 * - Não faz nenhuma consulta ao banco (função pura).
 * - Ordena por pontos e aplica a cadeia de desempate configurada,
 *   restringindo cada critério ao grupo que empatou nos anteriores.
 */
export function computeRanking(
  players: RankingPlayer[],
  matches: RankingMatch[],
  config: LevelConfig,
): ComputeResult {
  const stats = new Map<string, Stats>();
  for (const p of players) stats.set(p.id, emptyStats());
  const invalid: string[] = [];

  for (const m of matches) {
    const s1 = stats.get(m.player1_id);
    const s2 = stats.get(m.player2_id);
    if (!s1 || !s2) continue; // partida de jogador fora do nível

    const v = validateMatchScore(m.sets, config);
    if (!v.ok) {
      invalid.push(m.id);
      continue;
    }

    const winnerStats = v.winner === "p1" ? s1 : s2;
    const loserStats = v.winner === "p1" ? s2 : s1;

    winnerStats.pts += winnerPoints(config, v.loserSets);
    loserStats.pts += loserPoints(config, v);
    winnerStats.w += 1;
    loserStats.l += 1;

    // Sets e games (o vencedor do set tem a maior pontuação do set).
    for (const [a, b] of m.sets) {
      const p1Top = a > b;
      const top = p1Top ? s1 : s2;
      const bottom = p1Top ? s2 : s1;
      top.sw += 1;
      top.gw += Math.max(a, b);
      bottom.sl += 1;
      bottom.gl += Math.min(a, b);
    }

    s1.mp += 1;
    s2.mp += 1;
  }

  const ids = players.map((p) => p.id);

  // Pontos por partida entre um subgrupo (usado no confronto direto).
  const headToHead = (
    group: string[],
    matchesArr: RankingMatch[],
  ): Map<string, number> => {
    const set = new Set(group);
    const out = new Map<string, number>();
    for (const id of group) out.set(id, 0);
    for (const m of matchesArr) {
      if (!set.has(m.player1_id) || !set.has(m.player2_id)) continue;
      const v = validateMatchScore(m.sets, config);
      if (!v.ok) continue;
      const p1 = out.get(m.player1_id)!;
      const p2 = out.get(m.player2_id)!;
      const winPts = winnerPoints(config, v.loserSets);
      const losePts = loserPoints(config, v);
      if (v.winner === "p1") {
        out.set(m.player1_id, p1 + winPts);
        out.set(m.player2_id, p2 + losePts);
      } else {
        out.set(m.player1_id, p1 + losePts);
        out.set(m.player2_id, p2 + winPts);
      }
    }
    return out;
  };

  const criterionValue = (
    key: TiebreakKey,
    id: string,
    group: string[],
  ): number => {
    const s = stats.get(id)!;
    switch (key) {
      case "wins":
        return s.w;
      case "head_to_head":
        return headToHead(group, matches).get(id)!;
      case "set_diff":
        return s.sw - s.sl;
      case "game_diff":
        return s.gw - s.gl;
    }
  };

  const byId = new Map(players.map((p) => [p.id, p]));

  // Ordena um grupo empatado aplicando o critério `k`; grupos com o mesmo
  // valor recursivamente avançam para o próximo critério.
  const sortGroup = (group: string[], k: number): string[] => {
    if (group.length <= 1 || k >= config.tiebreakers.length) {
      // Fallback determinístico: nome e depois id.
      return [...group].sort((a, b) => {
        const na = byId.get(a)?.name ?? "";
        const nb = byId.get(b)?.name ?? "";
        if (na !== nb) return na.localeCompare(nb, "pt-BR");
        return a.localeCompare(b);
      });
    }
    const key = config.tiebreakers[k];
    const buckets = new Map<number, string[]>();
    for (const id of group) {
      const value = criterionValue(key, id, group);
      const arr = buckets.get(value);
      if (arr) arr.push(id);
      else buckets.set(value, [id]);
    }
    const orderedValues = [...buckets.keys()].sort((a, b) => b - a);
    const out: string[] = [];
    for (const value of orderedValues) {
      out.push(...sortGroup(buckets.get(value)!, k + 1));
    }
    return out;
  };

  const ordered: string[] = [];
  const byPoints = new Map<number, string[]>();
  for (const id of ids) {
    const pts = stats.get(id)!.pts;
    const bucket = byPoints.get(pts);
    if (bucket) bucket.push(id);
    else byPoints.set(pts, [id]);
  }
  // 1º critério: PONTOS (decrescente). A cadeia de desempate configurada
  // pelo administrador é aplicada NA ORDEM escolhida, apenas dentro de cada
  // grupo empatado em pontos (é o que a tela de configuração promete).
  for (const pts of [...byPoints.keys()].sort((a, b) => b - a)) {
    ordered.push(...sortGroup(byPoints.get(pts)!, 0));
  }

  const entries: RankingEntry[] = ordered.map((id, index) => {
    const s = stats.get(id)!;
    return {
      pos: index + 1,
      id,
      pts: s.pts,
      w: s.w,
      l: s.l,
      sw: s.sw,
      sl: s.sl,
      gw: s.gw,
      gl: s.gl,
      mp: s.mp,
    };
  });

  return { entries, invalid };
}
