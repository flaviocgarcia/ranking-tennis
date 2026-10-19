import Link from "next/link";
import type { Metadata } from "next";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listLevelsAdmin } from "@/lib/queries/levels";
import { listActivePlayers, listPlayersForLevel } from "@/lib/queries/players";
import { MatchForm, type PlayerOpt } from "@/components/MatchForm";
import { toLevelOpt } from "@/components/matchOpts";

export const metadata: Metadata = { title: "Lançar resultado" };

/**
 * Lançamento administrativo. Jogadores e níveis vêm do servidor em duas
 * consultas — o formulário filtra no cliente, sem chamadas por interação.
 */
export default async function AdminNewResultPage() {
  const info = await requireAdmin();
  const supabase = await createSupabaseServer();
  const scope = adminScope(info);
  const [allLevels, players] = await Promise.all([
    listLevelsAdmin(supabase),
    scope
      ? listPlayersForLevel(supabase, scope)
      : listActivePlayers(supabase),
  ]);
  const levels = scope
    ? allLevels.filter((l) => l.id === scope && l.active)
    : allLevels.filter((l) => l.active);

  return (
    <>
      <h1 className="page-title">Lançar resultado</h1>
      <p className="page-sub">
        Resultado lançado pelo administrador pode ser salvo já confirmado
        (entra no ranking imediatamente).
      </p>
      <div className="card">
        <MatchForm
          mode="admin"
          levels={levels.map(toLevelOpt)}
          players={players as PlayerOpt[]}
        />
      </div>
      <p className="small">
        <Link href="/admin/results">← Resultados</Link>
      </p>
    </>
  );
}
