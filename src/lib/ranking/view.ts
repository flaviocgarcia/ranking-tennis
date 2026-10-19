import type { RankingEntry } from "@/lib/domain/config";

/** Linha pronta para exibição (números do snapshot + nome hidratado). */
export interface RankingViewRow extends RankingEntry {
  name: string;
  initials: string;
}

/**
 * Junta o snapshot numérico com os nomes buscados em uma única consulta
 * (ou ceil(n/100)), sem N+1.
 */
export function toViewRows(
  entries: RankingEntry[],
  names: Map<string, { name: string; initials: string }>,
): RankingViewRow[] {
  return entries.map((e) => {
    const n = names.get(e.id);
    return {
      ...e,
      name: n?.name ?? "(jogador removido)",
      initials: n?.initials ?? "?",
    };
  });
}
