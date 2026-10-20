import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailabilitySlot } from "@/types/db";
import type { AgendaEntry } from "@/lib/domain/availability";

/**
 * Leituras da agenda.
 *
 * Duas variantes de SELECT por causa dos grants de coluna (privacidade):
 *  - pública (anon): exatamente as colunas concedidas na 0005. O `!inner`
 *    em profiles/levels faz o RLS do 0002 remover da própria resposta
 *    jogadores inativos e níveis inativos — sem expor a coluna `active`;
 *  - membro: inclui `profiles.active` para filtrar de forma idêntica.
 */

const SELECT_PUBLIC =
  "id, player_id, level_id, play_date, slot, " +
  "profile:profiles!inner(id, name, initials), " +
  "level:levels!inner(id, code, name, slug, sort_order)";

const SELECT_MEMBER =
  "id, player_id, level_id, play_date, slot, " +
  "profile:profiles!inner(id, name, initials, active), " +
  "level:levels!inner(id, code, name, slug, sort_order)";

interface RawRow {
  id: string;
  player_id: string;
  level_id: string;
  play_date: string;
  slot: string;
  profile: {
    id: string;
    name: string;
    initials: string;
    active?: boolean;
  } | null;
  level: {
    id: string;
    code: string;
    name: string;
    slug: string;
    sort_order: number;
  } | null;
}

function toEntries(rows: RawRow[]): AgendaEntry[] {
  const out: AgendaEntry[] = [];
  for (const r of rows) {
    // !inner: nunca nulos; se vier nulo, o RLS escondeu o par — pula.
    if (!r.profile || !r.level) continue;
    if (r.profile.active === false) continue; // só existe na variante membro
    out.push({
      id: r.id,
      playerId: r.player_id,
      levelId: r.level_id,
      playDate: r.play_date,
      slot: r.slot as AvailabilitySlot,
      profile: {
        id: r.profile.id,
        name: r.profile.name,
        initials: r.profile.initials,
      },
      level: {
        id: r.level.id,
        code: r.level.code,
        name: r.level.name,
        slug: r.level.slug,
        sort_order: r.level.sort_order,
      },
    });
  }
  return out;
}

async function fetchEntries(
  supabase: SupabaseClient,
  select: string,
  from: string,
  to: string,
): Promise<AgendaEntry[]> {
  const { data, error } = await supabase
    .from("availability")
    .select(select)
    .gte("play_date", from)
    .lte("play_date", to)
    .order("play_date", { ascending: true });
  if (error) throw new Error(error.message);
  // select dinâmico: inferência de tipos do PostgREST não acompanha.
  return toEntries((data ?? []) as unknown as RawRow[]);
}

/** Agenda pública (anon) — página estática /agenda. Uma consulta por render. */
export function listUpcomingPublic(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<AgendaEntry[]> {
  return fetchEntries(supabase, SELECT_PUBLIC, from, to);
}

/** Agenda na área do jogador (sessão) — filtra inativos como a pública. */
export function listUpcomingMember(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<AgendaEntry[]> {
  return fetchEntries(supabase, SELECT_MEMBER, from, to);
}
