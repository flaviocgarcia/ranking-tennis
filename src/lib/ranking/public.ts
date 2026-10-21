import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyWindow,
  toViewRows,
  windowStart,
  type ChallengerViewRow,
} from "@/lib/domain/challenger";
import { hydrateNames } from "@/lib/queries/players";
import { getSnapshot } from "@/lib/queries/rankings";
import type { SnapshotRow } from "@/types/db";

export interface PublicLevelRef {
  id: string;
  code: string;
  slug: string;
  name: string;
}

export interface PublicRanking {
  level: PublicLevelRef;
  rows: ChallengerViewRow[];
  /** Data/hora do último recálculo do snapshot. */
  computedAt: string | null;
  /** Total de partidas confirmadas no histórico (sem janela). */
  matchesCount: number;
  /** Início da janela de 12 meses aplicada nesta leitura (YYYY-MM-DD). */
  windowFrom: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Monta a classificação pública do F CHALLENGER a partir do snapshot.
 *
 * - Janela de 12 meses aplicada NA LEITURA: os pontos caducam sozinhos,
 *   sem cron e sem recálculo (a página é ISR horária + revalidatePath
 *   nas escritas).
 * - Nomes hidratados em uma única consulta, depois de filtrar pela
 *   janela (só quem tem jogo na janela aparece).
 */
export async function loadPublicRanking(
  supabase: SupabaseClient,
  level: PublicLevelRef,
): Promise<PublicRanking> {
  const start = windowStart(todayIso());
  const snapshot: SnapshotRow | null = await getSnapshot(supabase, level.id);

  if (!snapshot) {
    return {
      level,
      rows: [],
      computedAt: null,
      matchesCount: 0,
      windowFrom: start,
    };
  }

  const windowRows = applyWindow(snapshot.data, start);
  const names = await hydrateNames(
    supabase,
    windowRows.map((r) => r.id),
  );

  return {
    level,
    rows: toViewRows(windowRows, names),
    computedAt: snapshot.computed_at,
    matchesCount: snapshot.data.mc,
    windowFrom: start,
  };
}
