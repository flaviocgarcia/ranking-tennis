import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseAnonKey, supabaseUrl } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Cliente administrativo (service role) — SOMENTE no servidor.
 *
 * Uso restrito a:
 * 1. ações administrativas já autenticadas e verificadas (requireAdmin);
 * 2. o bot do Telegram (webhook protegido por segredo).
 *
 * Bypassa RLS por design; toda lógica de autorização desses caminhos
 * vive em src/actions e src/lib/telegram.
 */
export function createSupabaseAdmin(): SupabaseClient {
  const key = serviceRoleKey();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. " +
        "Requerida para ações de administrador (Settings > API do Supabase).",
    );
  }
  if (!adminClient) {
    adminClient = createClient(supabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** true quando o recurso administrativo está disponível. */
export function adminAvailable(): boolean {
  return serviceRoleKey() !== null;
}

/** Mensagem padrão quando a chave de service não está configurada. */
export const SERVICE_KEY_HINT =
  "Recurso indisponível: configure SUPABASE_SERVICE_ROLE_KEY (Supabase > Settings > API) para acessar e-mails e gerenciar usuários.";
