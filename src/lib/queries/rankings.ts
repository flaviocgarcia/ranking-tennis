import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankingSnapshotData } from "@/lib/domain/config";
import type { SnapshotRow } from "@/types/db";

/** Snapshot do ranking de um nível (leitura pública/anon). */
export async function getSnapshot(
  supabase: SupabaseClient,
  levelId: string,
): Promise<SnapshotRow | null> {
  const { data, error } = await supabase
    .from("ranking_snapshots")
    .select("level_id, data, computed_at")
    .eq("level_id", levelId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler snapshot: ${error.message}`);
  return data as SnapshotRow | null;
}

/** Metadados de snapshot (data do cálculo) para uma lista de níveis. */
export async function getSnapshotsMeta(
  supabase: SupabaseClient,
  levelIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (levelIds.length === 0) return out;
  const { data, error } = await supabase
    .from("ranking_snapshots")
    .select("level_id, computed_at")
    .in("level_id", levelIds);
  if (error) throw new Error(`Falha ao ler snapshots: ${error.message}`);
  for (const row of (data ?? []) as Pick<SnapshotRow, "level_id" | "computed_at">[]) {
    out.set(row.level_id, row.computed_at);
  }
  return out;
}

/** Persiste (upsert) o snapshot calculado. Chamado apenas no servidor admin. */
export async function saveSnapshot(
  supabase: SupabaseClient,
  levelId: string,
  data: RankingSnapshotData,
): Promise<void> {
  const { error } = await supabase.from("ranking_snapshots").upsert({
    level_id: levelId,
    data,
    computed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Falha ao salvar snapshot: ${error.message}`);
}
