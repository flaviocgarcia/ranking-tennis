import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow, Role } from "@/types/db";

export const PROFILE_MIN_COLS = "id, name, initials";
export const PROFILE_ADMIN_COLS =
  "id, email, name, initials, role, level_id, admin_level_id, pending_approval, active, must_change_password, telegram_id, telegram_link_code, created_at, updated_at";

const MAX_PLAYERS_PER_LEVEL = 2000;

/**
 * Jogadores ativos de um nível (usado no formulário de resultado).
 * Uma única consulta limitada — a opção <select> renderiza no servidor,
 * sem chamada de rede por linha.
 */
export async function listPlayersForLevel(
  supabase: SupabaseClient,
  levelId: string,
): Promise<Pick<ProfileRow, "id" | "name" | "initials" | "level_id">[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, initials, level_id")
    .eq("level_id", levelId)
    .eq("active", true)
    .eq("pending_approval", false)
    .order("name", { ascending: true })
    .limit(MAX_PLAYERS_PER_LEVEL);
  if (error) throw new Error(`Falha ao listar jogadores: ${error.message}`);
  return (data ?? []) as Pick<
    ProfileRow,
    "id" | "name" | "initials" | "level_id"
  >[];
}

/** Todos os jogadores ativos (formulário administrativo de resultado). */
export async function listActivePlayers(
  supabase: SupabaseClient,
): Promise<Pick<ProfileRow, "id" | "name" | "initials" | "level_id">[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, initials, level_id")
    .eq("active", true)
    .eq("pending_approval", false)
    .order("name", { ascending: true })
    .limit(MAX_PLAYERS_PER_LEVEL);
  if (error) throw new Error(`Falha ao listar jogadores: ${error.message}`);
  return (data ?? []) as Pick<
    ProfileRow,
    "id" | "name" | "initials" | "level_id"
  >[];
}

export interface PlayersPageFilter {
  search?: string;
  levelId?: string;
  /** true = somente auto-cadastros aguardando aprovação. */
  pending?: boolean;
  page: number;
  pageSize: number;
}

/** Lista paginada de jogadores (painel). Busca por nome com ilike + limite. */
export async function listPlayersPaged(
  supabase: SupabaseClient,
  filter: PlayersPageFilter,
): Promise<{ rows: (ProfileRow & { level: { id: string; name: string } | null })[]; count: number }> {
  const from = (filter.page - 1) * filter.pageSize;
  let query = supabase
    .from("profiles")
    .select(
      // FK explícita: `profiles` tem DUAS referências a `levels`
      // (`level_id` = nível em que joga; `admin_level_id` = escopo de
      // administração), então o PostgREST precisa saber qual usar.
      `${PROFILE_ADMIN_COLS}, level:levels!profiles_level_id_fkey(id, name)`,
      { count: "exact" },
    );

  if (filter.search) {
    // Volume pequeno (clube): ilike com curinga inicial é suficiente;
    // se crescer, avaliar extensão pg_trgm (documentado em docs/free-tier.md).
    query = query.ilike("name", `%${filter.search.replace(/[%_]/g, "")}%`);
  }
  if (filter.levelId) query = query.eq("level_id", filter.levelId);
  if (filter.pending) query = query.eq("pending_approval", true);

  const { data, error, count } = await query
    .order("name", { ascending: true })
    .range(from, from + filter.pageSize - 1);

  if (error) throw new Error(`Falha ao listar jogadores: ${error.message}`);
  // O PostgREST devolve `level` como lista (relação to-one); o cast via
  // `unknown` reflete o shape real esperado pela UI.
  return {
    rows: (data ?? []) as unknown as (ProfileRow & {
      level: { id: string; name: string } | null;
    })[],
    count: count ?? 0,
  };
}

export async function getProfileAdmin(
  supabase: SupabaseClient,
  id: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_ADMIN_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar jogador: ${error.message}`);
  return data as ProfileRow | null;
}

const HYDRATE_CHUNK = 100;

/**
 * Hidrata nomes/iniciais a partir dos ids do snapshot em NO MÁXIMO
 * ceil(n/100) consultas (nunca uma por linha).
 */
export async function hydrateNames(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, { name: string; initials: string }>> {
  const out = new Map<string, { name: string; initials: string }>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += HYDRATE_CHUNK) {
    const chunk = unique.slice(i, i + HYDRATE_CHUNK);
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_MIN_COLS)
      .in("id", chunk);
    if (error) throw new Error(`Falha ao hidratar nomes: ${error.message}`);
    for (const row of (data ?? []) as Pick<ProfileRow, "id" | "name" | "initials">[]) {
      out.set(row.id, { name: row.name, initials: row.initials });
    }
  }
  return out;
}

export function isRole(v: unknown): v is Role {
  return v === "admin" || v === "player";
}
