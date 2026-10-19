/** Variáveis de ambiente centralizadas (validação única). */

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL não configurada. Copie .env.example para .env.local.",
    );
  }
  return url;
}

export function supabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada.");
  }
  return key;
}

/** Chave de serviço — só no servidor, apenas para ações administrativas. */
export function serviceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
    "http://localhost:3000"
  );
}

export function clubName(): string {
  return process.env.NEXT_PUBLIC_CLUB_NAME || "Clube de Tênis";
}

export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function telegramSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET || null;
}
