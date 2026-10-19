"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { initialsFromName } from "@/lib/domain/initials";
import { requiredString } from "@/lib/validation";
import type { ActionResult } from "@/types/db";

/** Encerra a sessão (chamado pelo botão "Sair"). */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
}

/** Atualiza o próprio nome (e as iniciais derivadas). */
export async function updateNameAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const info = await requireUser();
    const name = requiredString(formData.get("name"), "Nome", 120);
    const initials = initialsFromName(name);

    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from("profiles")
      .update({ name, initials })
      .eq("id", info.userId);
    if (error) throw new Error(error.message);

    // Os nomes aparecem no ranking e na lista de jogos públicos
    // (hidratação na renderização); limpa o cache estático das páginas
    // públicas afetadas.
    revalidatePath("/rankings");
    revalidatePath("/results");
    revalidatePath("/app/profile");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao salvar." };
  }
}

/** Limpa o aviso de "definir senha" após a troca bem-sucedida. */
export async function clearMustChangeAction(): Promise<ActionResult> {
  try {
    const info = await requireUser();
    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", info.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao salvar." };
  }
}

/**
 * Gera um novo código de vínculo com o Telegram (para o próprio jogador).
 * Devolve o código gerado: a coluna é privada (grant por coluna) e não é
 * relida na sessão — o form exibe o valor retornado.
 */
export async function regenerateTelegramCodeAction(
  _prev: ActionResult<{ code: string }> | null,
  _formData: FormData,
): Promise<ActionResult<{ code: string }>> {
  try {
    const info = await requireUser();
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_link_code: code })
      .eq("id", info.userId);
    if (error) throw new Error(error.message);
    return { ok: true, data: { code } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao gerar código." };
  }
}
