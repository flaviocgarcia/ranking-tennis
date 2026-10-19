import type { LevelConfig, TiebreakKey } from "@/lib/domain/config";
import { TIEBREAK_LABELS } from "@/lib/domain/config";

/** Descrição legível da configuração de um nível (regras públicas). */

export function describeFormat(config: LevelConfig): string {
  const bestOf = config.setsToWin * 2 - 1;
  const base = `Melhor de ${bestOf}: vence quem chegar a ${config.setsToWin} set${config.setsToWin > 1 ? "s" : ""}.`;
  if (config.superTiebreak.enabled) {
    return `${base} Set decisivo: tiebreakão — primeiro a ${config.superTiebreak.points} pontos, com vantagem de 2.`;
  }
  return `${base} Set decisivo: set comum (sem tiebreakão).`;
}

export function describeScoring(config: LevelConfig): string {
  const s = config.scoring;
  const straight =
    config.setsToWin === 1
      ? `Vitória sem ceder set: ${s.winStraight} pts`
      : `Vitória por ${config.setsToWin}x0: ${s.winStraight} pts`;
  const extended = `Vitória cedendo um set: ${s.winExtended} pts`;
  const loss = `Derrota: ${s.loss} pt${s.loss === 1 ? "" : "s"}`;
  const decider =
    config.superTiebreak.enabled && s.deciderLoserPoint !== false
      ? " · Derrota no tiebreakão: 1 ponto para o perdedor"
      : "";
  return `${straight} · ${extended} · ${loss}${decider}.`;
}

export function describeTiebreakers(config: LevelConfig): string {
  const labels = config.tiebreakers.map(
    (k: TiebreakKey, i) => `${i + 1}º ${TIEBREAK_LABELS[k]}`,
  );
  return `Desempate (após os pontos), nesta ordem: ${labels.join(" → ")}.`;
}
