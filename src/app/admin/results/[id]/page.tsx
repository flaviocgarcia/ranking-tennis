import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getLevelAdmin, listLevelsAdmin } from "@/lib/queries/levels";
import { getMatchAdmin } from "@/lib/queries/matches";
import { getProfileAdmin, listPlayersForLevel } from "@/lib/queries/players";
import { adminAvailable, createSupabaseAdmin } from "@/lib/supabase/admin";
import { MatchForm, type PlayerOpt } from "@/components/MatchForm";
import { toLevelOpt } from "@/components/matchOpts";
import type { ProfileRow } from "@/types/db";

export const metadata: Metadata = { title: "Editar resultado" };

export default async function AdminEditResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const info = await requireAdmin();
  const { id } = await params;

  const supabase = await createSupabaseServer();
  const match = await getMatchAdmin(supabase, id);
  if (!match) notFound();

  // Administrador de nível só acessa resultados do próprio nível.
  const scope = adminScope(info);
  if (scope && match.level_id !== scope) notFound();

  const [level, allLevels] = await Promise.all([
    getLevelAdmin(supabase, match.level_id),
    listLevelsAdmin(supabase),
  ]);
  if (!level) notFound();
  const levels = scope ? allLevels.filter((l) => l.id === scope) : allLevels;

  const listed = await listPlayersForLevel(supabase, level.id);

  // Um dos lados pode estar inativo (fora da lista ativa); busca os perfis
  // ausentes para o select continuar mostrando os nomes do resultado
  // original. A leitura completa do perfil usa a chave de service (colunas
  // `email`/`telegram_link_code` são privadas no RLS); sem ela, o formulário
  // apenas não sugere jogadores inativos.
  const missingIds = [match.player1_id, match.player2_id].filter(
    (pid) => !listed.some((p) => p.id === pid),
  );
  const missing: (ProfileRow | null)[] = adminAvailable()
    ? await Promise.all(
        missingIds.map((pid) => getProfileAdmin(createSupabaseAdmin(), pid)),
      )
    : [];
  const players: PlayerOpt[] = [
    ...listed,
    ...missing
      .filter((p) => p !== null)
      .map((p) => ({ id: p.id, name: p.name, level_id: level.id })),
  ];

  return (
    <>
      <h1 className="page-title">Editar resultado</h1>
      <p className="page-sub">
        Correções em um resultado confirmado recalculam o ranking do nível na
        mesma operação.
      </p>
      <div className="card">
        <MatchForm
          mode="admin"
          levels={levels.map(toLevelOpt)}
          players={players}
          initial={{
            id: match.id,
            levelId: match.level_id,
            player1Id: match.player1_id,
            player2Id: match.player2_id,
            playedOn: match.played_on,
            sets: (match.sets as [number, number][]).map(([a, b]) => `${a}-${b}`),
            format: match.format,
            walkoverWinner: match.walkover_winner,
            status: match.status === "pending" ? "pending" : "confirmed",
          }}
        />
      </div>
      <p className="small">
        <Link href="/admin/results">← Resultados</Link>
      </p>
    </>
  );
}
