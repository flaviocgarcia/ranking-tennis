import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente Supabase para Server Components/Actions com a sessão do usuário.
 * Sujeito ao RLS (como deve ser para operações de jogadores).
 *
 * As páginas privadas leem `cookies()`, o que as mantém dinâmicas
 * (nunca compartilhadas entre usuários em cache).
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  // Anotação explícita: createServerClient tem sobrecargas e o contexto
  // inline do setAll não é inferido pelo TypeScript.
  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Chamado a partir de um Server Component: as cookies já foram
        // enviadas pelo middleware/cliente — seguro ignorar.
      }
    },
  };
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: cookieMethods,
  });
}
