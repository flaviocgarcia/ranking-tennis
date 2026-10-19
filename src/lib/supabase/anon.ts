import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente ANON sem cookies — usado exclusivamente pelas páginas
 * públicas (/home, /rules, /rankings).
 *
 * Não toca em `cookies()`, portanto essas páginas permanecem
 * estáticas e nunca gastam function invocation por visita.
 * Sem sessão e sem persistência no navegador.
 */
export function createSupabaseAnon(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
