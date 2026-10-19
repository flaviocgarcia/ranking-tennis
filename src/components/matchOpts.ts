import type { LevelRow } from "@/types/db";
import type { LevelOpt } from "@/components/MatchForm";

/**
 * Converte a linha do nível para a opção consumida pelo formulário.
 * Mantido fora das pages para evitar exports de arquivos de rota.
 */
export function toLevelOpt(level: LevelRow): LevelOpt {
  return {
    id: level.id,
    name: level.name,
    setsToWin: level.config.setsToWin,
    superTiebreakEnabled: level.config.superTiebreak.enabled,
    superPoints: level.config.superTiebreak.points,
  };
}
