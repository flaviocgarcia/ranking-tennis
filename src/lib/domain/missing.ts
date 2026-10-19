/**
 * Domínio do "todos contra todos": quais confrontos de um nível ainda não
 * têm nenhuma partida registrada (pendente ou confirmada).
 *
 * - Função pura, sem consulta ao banco.
 * - Recebe apenas o elenco ELEGÍVEL (ativos/aprovados) e as partidas
 *   registradas do nível; um confronto basta haver em qualquer status.
 * - Partidas rejeitadas/excluídas deixam de contar — o confronto volta a
 *   faltar.
 */

export interface MissingGamesPlayer {
  id: string;
  name: string;
  initials: string;
}

/** Registro mínimo de partida que marca um confronto como "jogado". */
export interface RegisteredMatch {
  player1_id: string;
  player2_id: string;
}

export interface MissingGame {
  a: MissingGamesPlayer;
  b: MissingGamesPlayer;
}

export interface MissingGamesResult {
  /** Quantidade de pares possíveis no elenco (n × (n − 1) / 2). */
  totalPairs: number;
  /** Confrontos com pelo menos uma partida registrada. */
  playedPairs: number;
  /** Confrontos ainda sem nenhuma partida registrada. */
  missing: MissingGame[];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Calcula os jogos faltantes do todos-contra-todos de UM nível.
 * Os jogadores são ordenados por nome para a lista ser determinística.
 */
export function computeMissingGames(
  players: MissingGamesPlayer[],
  matches: RegisteredMatch[],
): MissingGamesResult {
  const roster = [...players].sort((x, y) =>
    x.name.localeCompare(y.name, "pt-BR"),
  );
  const eligible = new Set(roster.map((p) => p.id));

  const played = new Set<string>();
  for (const m of matches) {
    if (m.player1_id === m.player2_id) continue;
    if (!eligible.has(m.player1_id) || !eligible.has(m.player2_id)) continue;
    played.add(pairKey(m.player1_id, m.player2_id));
  }

  const missing: MissingGame[] = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      if (!played.has(pairKey(roster[i].id, roster[j].id))) {
        missing.push({ a: roster[i], b: roster[j] });
      }
    }
  }

  const totalPairs = (roster.length * (roster.length - 1)) / 2;
  return {
    totalPairs,
    playedPairs: totalPairs - missing.length,
    missing,
  };
}
