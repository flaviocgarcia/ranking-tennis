import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { computeChallengerSnapshot } from "@/lib/domain/challenger";
import type { ChallengerSnapshotData } from "@/lib/domain/challenger";
import { getLevelAdmin } from "@/lib/queries/levels";
import { MATCH_RANKING_COLS } from "@/lib/queries/matches";
import { PROFILE_MIN_COLS } from "@/lib/queries/players";
import { saveSnapshot } from "@/lib/queries/rankings";

/**
 * Limites de segurança: um clube pequeno nunca chega perto disso.
 * Evita leitura ilimitada caso o dado cresça de forma inesperada.
 */
const MAX_PLAYERS = 2000;
const MAX_MATCHES = 10000;

export interface RebuildResult {
  slug: string;
  invalid: string[];
  matchesUsed: number;
}

/**
 * Recalcula o snapshot do F CHALLENGER e o grava.
 *
 * O snapshot guarda as CONTRIBUTUIÇÕES por partida (data + pontos) de
 * cada jogador — o HISTÓRICO todo. A janela de 12 meses (caducidade dos
 * pontos) é aplicada na LEITURA, assim o ranking envelhece sozinho, sem
 * cron e sem recálculo.
 *
 * - Executada apenas no servidor, em escritas administrativas
 *   (resultado confirmado/editado/removido) ou na publicação manual —
 *   nunca em leituras.
 * - 3 consultas de leitura + 1 upsert (sem N+1, sem consultas por jogador).
 * - Também é a rotina de "verificar consistência": o mesmo cálculo é
 *   reproduzível a partir dos resultados oficiais.
 */
export async function rebuildRankingSnapshot(levelId: string): Promise<RebuildResult> {
  const admin = createSupabaseAdmin();

  const level = await getLevelAdmin(admin, levelId);
  if (!level) throw new Error("Nível não encontrado.");

  const [playersRes, matchesRes] = await Promise.all([
    admin
      .from("profiles")
      .select(PROFILE_MIN_COLS)
      .eq("level_id", levelId)
      .eq("active", true)
      .eq("pending_approval", false)
      .order("name", { ascending: true })
      .limit(MAX_PLAYERS),
    admin
      .from("matches")
      .select(MATCH_RANKING_COLS)
      .eq("level_id", levelId)
      .eq("status", "confirmed")
      .order("played_on", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_MATCHES),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (matchesRes.error) throw new Error(matchesRes.error.message);

  const players = (playersRes.data ?? []) as { id: string }[];
  const matches = matchesRes.data ?? [];

  const { data, invalid } = computeChallengerSnapshot(players, matches);
  await saveSnapshot(admin, levelId, data);

  return { slug: level.slug, invalid, matchesUsed: matches.length };
}

/**
 * Limpa o cache ESTÁTICO das páginas públicas atingidas por uma escrita:
 * `/rankings[...]` (classificação) e `/results[...]` (lista de jogos) —
 * as duas mudam juntas quando o ranking oficial muda. Nomes hidratados na
 * renderização também só aparecem frescos após esta limpeza.
 */
export function revalidateLevelPages(slug: string, oldSlug?: string): void {
  revalidatePath("/rankings");
  revalidatePath(`/rankings/${slug}`);
  revalidatePath("/results");
  revalidatePath(`/results/${slug}`);
  if (oldSlug && oldSlug !== slug) {
    revalidatePath(`/rankings/${oldSlug}`);
    revalidatePath(`/results/${oldSlug}`);
  }
}

/**
 * Recalcula o ranking do nível e limpa o cache das páginas públicas
 * afetadas. Caminho padrão de TODA escrita que muda a composição ou os
 * pontos de um ranking (resultado oficial, jogador ativo/nível, config).
 */
export async function rebuildAndRevalidate(levelId: string): Promise<RebuildResult> {
  const result = await rebuildRankingSnapshot(levelId);
  revalidateLevelPages(result.slug);
  return result;
}
