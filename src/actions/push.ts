"use server";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/types/db";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Salva a inscrição Web Push do navegador/aparelho do usuário.
 * Um aparelho por usuário: remove a inscrição anterior do MESMO endpoint
 * (troca de navegador) e as anteriores do próprio usuário (renovação de
 * chave). As inscrições mortas também são limpas a cada envio.
 */
export async function savePushSubscriptionAction(
  input: PushSubscriptionInput,
): Promise<ActionResult> {
  try {
    const info = await requireUser();
    if (info.profile.pending_approval) {
      return {
        ok: false,
        error:
          "Aguarde a aprovação do cadastro para ativar as notificações.",
      };
    }
    if (!input?.endpoint || !input?.p256dh || !input?.auth) {
      return { ok: false, error: "Inscrição de notificação inválida." };
    }
    const admin = createSupabaseAdmin();
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", input.endpoint);
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", info.userId);
    const { error } = await admin.from("push_subscriptions").insert({
      user_id: info.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao ativar notificações.",
    };
  }
}

/** Remove a inscrição do aparelho atual (desativar notificações). */
export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<ActionResult> {
  try {
    const info = await requireUser();
    const admin = createSupabaseAdmin();
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", info.userId)
      .eq("endpoint", endpoint);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao desativar notificações.",
    };
  }
}
