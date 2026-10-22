"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente do navegador — usado para Autenticação (entrar, sair,
 * cadastro, trocar senha) e para o TEMPO REAL do chat (assinatura de
 * `postgres_changes` com a sessão do usuário — o Realtime aplica as
 * mesmas policies de RLS). Qualquer outra leitura/escrita de tabela
 * continua passando pelo servidor.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
