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
        O usuário é criado com um e-mail de login e uma senha temporária
        (exibida uma única vez). Entregue os dois ao jogador: ele entra em{" "}
        <strong>/login</strong> e, no primeiro acesso, define a própria senha.
        Não é preciso código de ativação — essa página é só para quem já
        recebeu um convite.
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
