"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente do navegador — usado APENAS para Autenticação
 * (entrar, sair, cadastro, trocar senha). Nenhuma leitura/escrita de
 * tabela acontece pelo navegador; todos os dados passam pelo servidor,
 * o que mantém o RLS e o cache sob controle.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
