import type { SupabaseClient } from "@supabase/supabase-js";
import type { LevelRow } from "@/types/db";

export const LEVEL_COLS =
  "id, code, slug, name, sort_order, active, config";
export const LEVEL_ADMIN_COLS =
  "id, code, slug, name, sort_order, active, config, created_at, updated_at";

/** Níveis ativos (leitura pública — páginas estáticas). */
export async function listPublicLevels(
  supabase: SupabaseClient,
): Promise<Pick<LevelRow, "id" | "code" | "slug" | "name" | "sort_order" | "config">[]> {
  const { data, error } = await supabase
    .from("levels")
    .select(LEVEL_COLS)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw new Error(`Falha ao listar níveis: ${error.message}`);
  return (data ?? []) as LevelRow[];
}

/** Nível público por slug (/rankings/a). Inativos são filtrados pelo RLS. */
export async function getPublicLevelBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<LevelRow | null> {
  const { data, error } = await supabase
    .from("levels")
    .select(LEVEL_COLS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar nível: ${error.message}`);
  return data as LevelRow | null;
}

/** Lista de níveis para o painel administrativo (inclui inativos). */
export async function listLevelsAdmin(
  supabase: SupabaseClient,
): Promise<LevelRow[]> {
  const { data, error } = await supabase
    .from("levels")
    .select(LEVEL_ADMIN_COLS)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw new Error(`Falha ao listar níveis: ${error.message}`);
  return (data ?? []) as LevelRow[];
}

export async function getLevelAdmin(
  supabase: SupabaseClient,
  id: string,
): Promise<LevelRow | null> {
  const { data, error } = await supabase
    .from("levels")
    .select(LEVEL_ADMIN_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar nível: ${error.message}`);
  return data as LevelRow | null;
}
