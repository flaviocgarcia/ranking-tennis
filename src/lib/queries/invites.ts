import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Convites do F CHALLENGER (pré-cadastro dos atletas da planilha).
 *
 * A tabela é PRIVADA (migration 0006: sem leitura para anon/authenticated)
 * porque `activation_code` é uma credencial — quem tem o código cria a
 * conta. Por isso TODA leitura acontece aqui no servidor, com a chave de
 * service.
 */

export const INVITE_COLS =
  "id, name, phone, ref_level, activation_code, auth_user_id, consumed_at, activated_at, created_at";

export interface InviteRow {
  id: string;
  name: string;
  phone: string | null;
  ref_level: string | null;
  activation_code: string;
  /** Preenchido na importação (conta placeholder) ou na ativação. */
  auth_user_id: string | null;
  consumed_at: string | null;
  /** Só preenchido quando o atleta conclui a ativação em /ativar. */
  activated_at: string | null;
  created_at: string;
}

/** Todos os convites (painel administrativo). */
export async function listInvitesAdmin(
  supabase: SupabaseClient,
): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from("invites")
    .select(INVITE_COLS)
    .order("activated_at", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`Falha ao listar convites: ${error.message}`);
  return (data ?? []) as InviteRow[];
}

/** Convite pelo código de ativação (normalizado). */
export async function getInviteByCodeAdmin(
  supabase: SupabaseClient,
  code: string,
): Promise<InviteRow | null> {
  const { data, error } = await supabase
    .from("invites")
    .select(INVITE_COLS)
    .eq("activation_code", code)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar convite: ${error.message}`);
  return (data ?? null) as InviteRow | null;
}
