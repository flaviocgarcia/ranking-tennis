import type { Metadata } from "next";
import Link from "next/link";
import { listPublicLevels } from "@/lib/queries/levels";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import { loadPublicRanking } from "@/lib/ranking/public";
import { RankingPanel } from "@/components/RankingPanel";

export const metadata: Metadata = {
  title: "Classificação",
  description: "Classificação publicada do F CHALLENGER.",
};

export const revalidate = 3600;

async function loadData() {
  try {
    const anon = createSupabaseAnon();
    const levels = await listPublicLevels(anon);
    const level = levels[0];
    if (!level) return { kind: "empty" as const };

    const data = await loadPublicRanking(anon, level);
    if (data.rows.length === 0) return { kind: "empty" as const, level };
    return { kind: "ok" as const, data };
  } catch (e) {
    console.error("[rankings] falha ao carregar:", e);
    return { kind: "error" as const };
  }
}

/** Índice público: com um torneio só, a página já mostra a classificação. */
export default async function RankingsIndexPage() {
  const data = await loadData();

  if (data.kind === "error") {
    return (
      <>
        <h1 className="page-title">Classificação</h1>
        <div className="card">
          <p className="muted">
            Não foi possível carregar a classificação agora. Tente novamente em
            instantes.
          </p>
        </div>
      </>
    );
  }

  if (data.kind === "empty") {
    return (
      <>
        <h1 className="page-title">Classificação</h1>
        <div className="card">
          <p className="muted">
            A classificação ainda não tem jogos na janela de 12 meses.
          </p>
          <p className="small">
            <Link href="/rules">Ver o regulamento</Link>
          </p>
        </div>
      </>
    );
  }

  return <RankingPanel data={data.data} />;
}
