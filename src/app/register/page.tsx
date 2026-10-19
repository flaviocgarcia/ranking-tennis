import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import { listPublicLevels } from "@/lib/queries/levels";
import { clubName } from "@/lib/env";

export const metadata: Metadata = { title: "Criar conta" };

/**
 * Página estática (renderizada no build): a lista de níveis vem do Supabase
 * uma única vez e é embutida no HTML — nenhuma consulta por visita.
 */
export default async function RegisterPage() {
  const levels = await listPublicLevels(createSupabaseAnon());

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <p className="brand center">
          <span className="mark">🎾</span>
          {clubName()}
        </p>
        <h1 className="center" style={{ fontSize: 20 }}>
          Criar conta
        </h1>
        <RegisterForm levels={levels.map((l) => ({ id: l.id, name: l.name }))} />
      </div>
    </div>
  );
}
