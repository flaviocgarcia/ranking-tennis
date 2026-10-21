import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicLevelBySlug, listPublicLevels } from "@/lib/queries/levels";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import { loadPublicRanking, type PublicRanking } from "@/lib/ranking/public";
import { RankingPanel } from "@/components/RankingPanel";
import type { LevelRow } from "@/types/db";

/**
 * Página pública de um ranking — ESTÁTICA com ISR horário:
 *
 *  - a escrita (resultado confirmado/removido) chama revalidatePath e a
 *    página atualiza na hora;
 *  - a revalidação horária aplica a JANELA DE 12 MESES da leitura — é
 *    ela que faz os pontos antigos caducarem, sem cron e sem recálculo.
 */

export const revalidate = 3600;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const levels = await listPublicLevels(createSupabaseAnon());
    return levels.map((l) => ({ slug: l.slug }));
  } catch {
    // Sem banco na build: as páginas serão geradas sob demanda.
    return [];
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const level = await getPublicLevelBySlug(createSupabaseAnon(), slug);
    if (!level) return { title: "Classificação" };
    return {
      title: `Classificação — ${level.name}`,
      description: `Classificação publicada do ${level.name}.`,
    };
  } catch {
    return { title: "Classificação" };
  }
}

async function loadData(slug: string): Promise<
  | { kind: "error" }
  | { kind: "empty"; level: LevelRow }
  | { kind: "ok"; data: PublicRanking }
  | { kind: "notfound" }
> {
  try {
    const anon = createSupabaseAnon();
    const level = await getPublicLevelBySlug(anon, slug);
    if (!level) return { kind: "notfound" };

    const data = await loadPublicRanking(anon, level);
    if (data.rows.length === 0) {
      return { kind: "empty", level };
    }
    return { kind: "ok", data };
  } catch (e) {
    console.error("[ranking] falha ao carregar:", e);
    return { kind: "error" };
  }
}

export default async function PublicRankingPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadData(slug);

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
  if (data.kind === "notfound") notFound();

  if (data.kind === "empty") {
    return (
      <>
        <h1 className="page-title">{data.level.name}</h1>
        <div className="card">
          <p className="muted">
            A classificação ainda não tem jogos na janela de 12 meses.
          </p>
          <p className="small">
            <Link href={`/rules`}>Ver o regulamento</Link>
          </p>
        </div>
      </>
    );
  }

  return <RankingPanel data={data.data} />;
}
