import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/db";

/**
 * Perfil visível na sessão comum: `email` e `telegram_link_code` ficam de
 * fora por privacidade (o grant de select é por coluna — ver 0002_rls.sql).
 * O e-mail do próprio usuário vem do Auth (`SessionInfo.email`).
 */
// `ref_level` fica de fora: ele só é lido na relação pública (grant do
// anon) e no painel administrativo (chave de serviço) — a sessão não usa.
export type SessionProfile = Omit<
  ProfileRow,
  "email" | "telegram_link_code" | "ref_level"
>;

export interface SessionInfo {
  userId: string;
  email: string | null;
  profile: SessionProfile;
}

/**
 * Lê sessão + perfil UMA vez por requisição (React cache deduplica
 * entre layout e páginas — nenhuma consulta repetida na renderização).
 */
export const getSessionInfo = cache(async (): Promise<SessionInfo | null> => {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, name, initials, role, level_id, active, must_change_password, telegram_id, created_at, updated_at, admin_level_id, pending_approval",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.active) return null;

  return { userId: user.id, email: user.email ?? null, profile };
});

/** Exige usuário autenticado; redireciona para /login caso contrário. */
export async function requireUser(): Promise<SessionInfo> {
  const info = await getSessionInfo();
  if (!info) redirect("/login");
  return info;
}

/** Exige administrador; manda para /app caso contrário. */
export async function requireAdmin(): Promise<SessionInfo> {
  const info = await getSessionInfo();
  if (!info) redirect("/login");
  if (info.profile.role !== "admin") redirect("/app");
  return info;
}

/**
 * Nível do escopo administrativo.
 *
 * - `null`  => administrador GERAL (todos os níveis);
 * - uuid    => administrador SOMENTE daquele nível.
 *
 * Todo o controle é aplicado no servidor: as escritas administrativas usam
 * a chave de service (que ignora RLS), então cada action valida o escopo
 * depois de `requireAdmin()`.
 */
export function adminScope(info: SessionInfo): string | null {
  return info.profile.role === "admin" ? info.profile.admin_level_id : null;
}

/**
 * Verifica se o nível está dentro do escopo do administrador.
 * Devolve a mensagem de erro, ou `null` quando permitido.
 */
export function levelOutOfScope(
  info: SessionInfo,
  levelId: string | null,
): string | null {
  const scope = adminScope(info);
  if (!scope || levelId === scope) return null;
  return "Ação permitida apenas no nível sob sua responsabilidade.";
}

/** Exige administrador GERAL (gestão de níveis é global). */
export async function requireGlobalAdmin(): Promise<SessionInfo> {
  const info = await requireAdmin();
  if (adminScope(info)) redirect("/admin");
  return info;
}
