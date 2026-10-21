import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchRow, MatchStatus } from "@/types/db";

export const MATCH_ADMIN_COLS =
  "id, level_id, player1_id, player2_id, sets, format, walkover_winner, status, reported_by, confirmed_by, confirmed_at, played_on, source, external_ref, created_at, updated_at";

/**
 * Campos mínimos para o cálculo de classificação
 * (nenhum campo além do usado pelo domínio).
 */
export const MATCH_RANKING_COLS =
  "id, player1_id, player2_id, sets, format, walkover_winner, played_on";

/**
 * Colunas públicas (páginas estáticas de resultados).
 * O RLS (migration 0003) restringe às linhas confirmadas; os grants de
 * coluna impedem expor `reported_by`, `source`, `external_ref`, etc.
 */
export const MATCH_PUBLIC_COLS =
  "id, level_id, player1_id, player2_id, sets, format, walkover_winner, played_on";

export interface PublicMatchRow {
  id: string;
  level_id: string;
  player1_id: string;
  player2_id: string;
  sets: MatchRow["sets"];
  format: MatchRow["format"];
  walkover_winner: MatchRow["walkover_winner"];
  played_on: string;
}

/**
 * Resultados CONFIRMADOS (leitura pública das páginas estáticas
 * /results e /results/[slug]).
 *
 * Sem join: os nomes são hidratados em blocos com `hydrateNames`, como
 * no ranking — evita depender do RLS de `profiles` dentro do join e
 * mantém o mesmo padrão de consulta econômica.
 */
export async function listPublicConfirmedMatches(
  supabase: SupabaseClient,
  filter: { levelId?: string; limit: number },
): Promise<PublicMatchRow[]> {
  let query = supabase
    .from("matches")
    .select(MATCH_PUBLIC_COLS)
    .eq("status", "confirmed")
    .order("played_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(filter.limit);
  if (filter.levelId) query = query.eq("level_id", filter.levelId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar resultados públicos: ${error.message}`);
  }
  return (data ?? []) as PublicMatchRow[];
}

const MATCH_JOINS =
  "level:levels(id, slug, name), p1:profiles!matches_player1_id_fkey(id, name), p2:profiles!matches_player2_id_fkey(id, name)";

export interface MatchesPageFilter {
  levelId?: string;
  status?: MatchStatus;
  page: number;
  pageSize: number;
}

/** Lista paginada de resultados (painel), com joins em uma única consulta. */
export async function listMatchesAdmin(
  supabase: SupabaseClient,
  filter: MatchesPageFilter,
): Promise<{
  rows: Array<
    MatchRow & {
      level: { id: string; slug: string; name: string } | null;
      p1: { id: string; name: string } | null;
      p2: { id: string; name: string } | null;
    }
  >;
  count: number;
}> {
  const from = (filter.page - 1) * filter.pageSize;
  let query = supabase
    .from("matches")
    .select(`${MATCH_ADMIN_COLS}, ${MATCH_JOINS}`, { count: "exact" });
  if (filter.levelId) query = query.eq("level_id", filter.levelId);
  if (filter.status) query = query.eq("status", filter.status);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + filter.pageSize - 1);

  if (error) throw new Error(`Falha ao listar resultados: ${error.message}`);
  return { rows: (data ?? []) as never, count: count ?? 0 };
}

/**
 * Resultados do usuário logado, paginados (histórico completo nunca é
 * carregado de uma vez).
 */
export async function listMyMatches(
  supabase: SupabaseClient,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{
  rows: Array<
    MatchRow & {
      level: { id: string; slug: string; name: string } | null;
      p1: { id: string; name: string } | null;
      p2: { id: string; name: string } | null;
    }
  >;
  count: number;
}> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("matches")
    .select(`${MATCH_ADMIN_COLS}, ${MATCH_JOINS}`, { count: "exact" })
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order("played_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(`Falha ao listar seus resultados: ${error.message}`);
  return { rows: (data ?? []) as never, count: count ?? 0 };
}

/** Últimos N resultados de um jogador (dashboard e Telegram). */
export async function listRecentMatchesOf(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<
  Array<
    MatchRow & {
      p1: { id: string; name: string } | null;
      p2: { id: string; name: string } | null;
      level: { id: string; slug: string; name: string } | null;
    }
  >
> {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `${MATCH_ADMIN_COLS}, level:levels(id, slug, name), p1:profiles!matches_player1_id_fkey(id, name), p2:profiles!matches_player2_id_fkey(id, name)`,
    )
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order("played_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Falha ao buscar resultados: ${error.message}`);
  return (data ?? []) as never;
}

export async function getMatchAdmin(
  supabase: SupabaseClient,
  id: string,
): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_ADMIN_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar resultado: ${error.message}`);
  return data as MatchRow | null;
}

export async function countMatchesByStatus(
  supabase: SupabaseClient,
  levelId?: string | null,
): Promise<{ pending: number; confirmed: number; total: number }> {
  const mk = (status?: MatchStatus) => {
    let q = supabase.from("matches").select("id", { count: "exact", head: true });
    if (status) q = q.eq("status", status);
    if (levelId) q = q.eq("level_id", levelId);
    return q;
  };
  const [pending, confirmed, total] = await Promise.all([
    mk("pending"),
    mk("confirmed"),
    mk(),
  ]);
  if (pending.error || confirmed.error || total.error) {
    throw new Error("Falha ao contar resultados.");
  }
  return {
    pending: pending.count ?? 0,
    confirmed: confirmed.count ?? 0,
    total: total.count ?? 0,
  };
}
