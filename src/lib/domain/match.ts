import type { LevelConfig, ScoreSet } from "./config";

/** Resultado validado de uma partida. */
export interface ValidMatch {
  ok: true;
  winner: "p1" | "p2";
  loser: "p1" | "p2";
  /** Sets vencidos pelo vencedor (ex.: 2 em 2x1). */
  winnerSets: number;
  loserSets: number;
}

export interface InvalidMatch {
  ok: false;
  error: string;
}

function isNormalSet(a: number, b: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return false;
  }
  if (a === b) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  // Só placares ALCANÇÁVEIS: o set termina no primeiro momento em que
  // alguém tem 6 games e 2 de vantagem (ou 7-6, no tiebreak do 6-6).
  // Portanto 7-4, 8-5, 9-6 etc. são impossíveis (o set já teria
  // acabado em 6-4, 7-5, 8-6...).
  if (hi === 6 && lo <= 4) return true; // 6-0..6-4
  if (hi === 7 && lo === 5) return true; // 7-5
  if (hi === 7 && lo === 6) return true; // 7-6 (tiebreak no 6-6)
  if (hi - lo === 2 && hi >= 8) return true; // 8-6, 9-7, 10-8...
  return false;
}

function isSuperTiebreak(a: number, b: number, points: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return false;
  }
  if (a === b) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  // Como no set normal, exige um placar ALCANÇÁVEL: o tiebreakão acaba no
  // primeiro momento em que alguém tem `points` e 2 de vantagem. Depois
  // disso só segue o desempate a 2 (11-9, 12-10, 13-11...). Por isso
  // 11-7, 11-8 ou 12-9 são impossíveis: o set já teria terminado em
  // 10-7, 10-8 ou 11-9.
  if (hi === points) return lo <= points - 2; // 10-0..10-8
  if (hi - lo === 2 && hi > points && lo >= points - 1) return true; // 11-9, 12-10...
  return false;
}

/**
 * Valida um placar completo contra a configuração do nível.
 *
 * Regras:
 * - No máximo `setsToWin * 2 - 1` sets.
 * - Cada set não-decisivo precisa seguir as regras de set normal.
 * - Set decisivo: super tiebreak (se habilitado) ou set normal.
 * - Sets vazios/inválidos => erro.
 */
export function validateMatchScore(
  sets: ScoreSet[],
  config: LevelConfig,
): ValidMatch | InvalidMatch {
  const { setsToWin, superTiebreak } = config;

  if (!Array.isArray(sets) || sets.length === 0) {
    return { ok: false, error: "Informe ao menos um set." };
  }
  const maxSets = setsToWin * 2 - 1;
  if (sets.length > maxSets) {
    return {
      ok: false,
      error: `A melhor de ${maxSets} aceita no máximo ${maxSets} sets.`,
    };
  }

  let p1 = 0;
  let p2 = 0;

  for (let i = 0; i < sets.length; i++) {
    const raw = sets[i];
    if (
      !Array.isArray(raw) ||
      raw.length !== 2 ||
      typeof raw[0] !== "number" ||
      typeof raw[1] !== "number"
    ) {
      return { ok: false, error: `Set ${i + 1} inválido.` };
    }
    const [a, b] = raw;

    const deciding = p1 === setsToWin - 1 && p2 === setsToWin - 1;
    // Set decisivo (empate 1-1 no melhor de 3): o regulamento do F
    // CHALLENGER manda tiebreakão, mas jogos registrados com set comum
    // também são aceitos (decisão: os dois formatos valem — a pontuação
    // é a mesma, 200/100). Fora do decisivo, só set comum.
    const valid = deciding && superTiebreak.enabled
      ? isSuperTiebreak(a, b, superTiebreak.points) || isNormalSet(a, b)
      : isNormalSet(a, b);

    if (!valid) {
      if (deciding && superTiebreak.enabled) {
        return {
          ok: false,
          error: `Set ${i + 1} inválido: o set decisivo é tiebreakão (primeiro a ${superTiebreak.points}, vantagem de 2) ou um set comum (ex.: 6-4).`,
        };
      }
      return { ok: false, error: `Set ${i + 1} inválido (placar: ${a}x${b}).` };
    }

    if (a > b) p1++;
    else p2++;
  }

  if (p1 === setsToWin && p2 < setsToWin) {
    return { ok: true, winner: "p1", loser: "p2", winnerSets: p1, loserSets: p2 };
  }
  if (p2 === setsToWin && p1 < setsToWin) {
    return { ok: true, winner: "p2", loser: "p1", winnerSets: p2, loserSets: p1 };
  }
  return {
    ok: false,
    error: `A partida precisa terminar com ${setsToWin} sets vencidos por um dos jogadores.`,
  };
}

/** Pontos atribuídos ao vencedor conforme a pontuação configurada. */
export function winnerPoints(config: LevelConfig, loserSets: number): number {
  return loserSets === 0
    ? config.scoring.winStraight
    : config.scoring.winExtended;
}

/**
 * Pontos atribuídos ao perdedor.
 *
 * - Normalmente vale `scoring.loss` (padrão 0).
 * - Quando a partida foi decidida no tiebreakão e a opção está ligada
 *   (padrão), o perdedor ganha 1 ponto — nunca menos do que `loss`.
 *   Configurações antigas (sem a chave) assumem a opção ligada.
 */
export function loserPoints(
  config: LevelConfig,
  result: { winnerSets: number; loserSets: number },
): number {
  const base = config.scoring.loss;
  const decidedOnSuperTiebreak =
    config.superTiebreak.enabled &&
    result.winnerSets === config.setsToWin &&
    result.loserSets === config.setsToWin - 1;
  return decidedOnSuperTiebreak && config.scoring.deciderLoserPoint !== false
    ? Math.max(base, 1)
    : base;
}
