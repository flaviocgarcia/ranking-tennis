import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getLevelAdmin } from "@/lib/queries/levels";
import { listPlayersForLevel } from "@/lib/queries/players";
import { MatchForm } from "@/components/MatchForm";
import { toLevelOpt } from "@/components/matchOpts";

export const metadata: Metadata = { title: "Informar resultado" };

/**
 * Informar resultado (jogador). Os adversários do próprio nível são
 * carregados no servidor e renderizados em um <select> — zero chamadas
 * de rede para busca/autocomplete.
 */
export default async function NewResultPage() {
  const info = await requireUser();
  const supabase = await createSupabaseServer();

  if (info.profile.pending_approval) {
    return (
      <>
        <h1 className="page-title">Informar resultado</h1>
        <div className="alert alert-warn">
          Seu cadastro aguarda aprovação do administrador. Assim que aprovado,
          você poderá informar resultados.
        </div>
        <p>
          <Link href="/app">← Voltar</Link>
        </p>
      </>
    );
  }

  if (!info.profile.level_id) {
    return (
      <>
        <h1 className="page-title">Informar resultado</h1>
        <div className="alert alert-warn">
          Você ainda não possui um nível atribuído e não pode informar
          resultados. Fale com o administrador.
        </div>
        <p>
          <Link href="/app">← Voltar</Link>
        </p>
      </>
    );
  }

  const level = await getLevelAdmin(supabase, info.profile.level_id);
  if (!level) {
    return (
      <>
        <h1 className="page-title">Informar resultado</h1>
        <div className="alert alert-error">
          Seu nível não está disponível no momento.
        </div>
      </>
    );
  }

  const players = await listPlayersForLevel(supabase, level.id);

  return (
    <>
      <h1 className="page-title">Informar resultado</h1>
      <p className="page-sub">
        <strong>{level.name}</strong> — escolha o formato (Normal, Grand Slam ou
        W.O.); o resultado entra como pendente até o administrador confirmar.
      </p>
      <div className="card">
        <MatchForm mode="player" levels={[toLevelOpt(level)]} players={players} />
      </div>
      <p className="small">
        <Link href="/app/results">← Meus resultados</Link>
      </p>
    </>
  );
}
