import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { adminAvailable, createSupabaseAdmin, SERVICE_KEY_HINT } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { getProfileAdmin } from "@/lib/queries/players";
import { listLevelsAdmin } from "@/lib/queries/levels";
import { EditPlayerForm } from "@/components/PlayersForms";
import { approvePlayerAction } from "@/actions/players";

export const metadata: Metadata = { title: "Editar jogador" };

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const info = await requireAdmin();
  const { id } = await params;

  // `email` é coluna privada no RLS (grant por coluna) => service key.
  if (!adminAvailable()) {
    return (
      <>
        <h1 className="page-title">Editar jogador</h1>
        <div className="alert alert-warn">{SERVICE_KEY_HINT}</div>
        <p className="small">
          <Link href="/admin/players">← Jogadores</Link>
        </p>
      </>
    );
  }

  const supabase = createSupabaseAdmin();
  const [player, levels] = await Promise.all([
    getProfileAdmin(supabase, id),
    listLevelsAdmin(supabase),
  ]);
  if (!player) notFound();

  // Administrador de nível não acessa jogadores de outros níveis.
  const scope = adminScope(info);
  if (scope && player.level_id !== scope) notFound();

  const levelsForForm = scope ? levels.filter((l) => l.id === scope) : levels;

  return (
    <>
      <h1 className="page-title">{player.name}</h1>
      <p className="page-sub">
        {player.email} · cadastro em {formatDate(player.created_at)}
      </p>

      {player.pending_approval && (
        <div className="card">
          <div className="alert alert-warn" style={{ marginTop: 0 }}>
            <strong>Aguardando aprovação.</strong> Este cadastro foi feito pelo
            próprio jogador e ainda não participa do ranking.
          </div>
          <form action={approvePlayerAction}>
            <input type="hidden" name="id" value={player.id} />
            <button className="btn" type="submit">
              Aprovar cadastro
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <EditPlayerForm
          player={{
            id: player.id,
            name: player.name,
            level_id: player.level_id,
            ref_level: player.ref_level,
            active: player.active,
            role: player.role,
            admin_level_id: player.admin_level_id,
            pending_approval: player.pending_approval,
          }}
          levels={levelsForForm.map((l) => ({ id: l.id, name: l.name }))}
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
