import webpush from "web-push";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { vapidPrivateKey, vapidPublicKey, vapidSubject } from "@/lib/env";

/**
 * Envio de Web Push (padrão W3C, sem Firebase/SDK de terceiros).
 *
 * - As chaves VAPID vivem nos envs (NEXT_PUBLIC_VAPID_PUBLIC_KEY é pública
 *   por definição; a privada nunca sai do servidor).
 * - Todo envio é MELHOR ESFORÇO: falha de push nunca derruba o fluxo
 *   principal (gravar chat, confirmar resultado).
 * - Inscrições mortas (404/410 do serviço de push) são removidas na hora.
 */
let configured = false;

function ensureConfigured(): boolean {
  const pub = vapidPublicKey();
  const priv = vapidPrivateKey();
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(vapidSubject(), pub, priv);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Caminho interno aberto ao clicar na notificação (ex.: /app/chat?c=…). */
  url: string;
}

/** Status HTTP que indicam inscrição expirada/removida. */
function deadStatus(reason: unknown): boolean {
  const status = (reason as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

/**
 * Notifica os usuários informados. Nunca lança erro — uma falha do
 * serviço de push não pode impedir a ação que disparou a notificação.
 */
export async function notifyUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0 || !ensureConfigured()) return;
  try {
    const admin = createSupabaseAdmin();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (!subs || subs.length === 0) return;

    const message = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        ),
      ),
    );

    const dead: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        if (deadStatus(r.reason)) dead.push(subs[i].id);
      } else if (deadStatus(r.value)) {
        dead.push(subs[i].id);
      }
    });
    if (dead.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", dead);
    }
  } catch {
    // Melhor esforço: notificação nunca interrompe o fluxo principal.
  }
}
