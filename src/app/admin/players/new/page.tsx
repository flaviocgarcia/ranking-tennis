import Link from "next/link";
import type { Metadata } from "next";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listLevelsAdmin } from "@/lib/queries/levels";
import { CreatePlayerForm } from "@/components/PlayersForms";

export const metadata: Metadata = { title: "Cadastrar jogador" };

export default async function NewPlayerPage() {
  const info = await requireAdmin();
  const supabase = await createSupabaseServer();
  const allLevels = await listLevelsAdmin(supabase);

  // Administrador de nível só cadastra no próprio nível e não cria admins.
  const scope = adminScope(info);
  const levels = scope ? allLevels.filter((l) => l.id === scope) : allLevels;

  return (
    <>
      <h1 className="page-title">Cadastrar jogador</h1>
      <p className="page-sub">
        O usuário recebe uma senha temporária e é obrigado a definir a própria
        senha no primeiro acesso.
      </p>
      <div className="card">
        <CreatePlayerForm
          levels={levels.map((l) => ({ id: l.id, name: l.name }))}
          lockedLevelId={scope}
          canManageAdmins={!scope}
        />
      </div>
      <p className="small">
        <Link href="/admin/players">← Jogadores</Link>
      </p>
    </>
  );
}
