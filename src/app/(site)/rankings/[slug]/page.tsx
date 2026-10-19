import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicLevelBySlug, listPublicLevels } from "@/lib/queries/levels";
import { getSnapshot } from "@/lib/queries/rankings";
import { hydrateNames } from "@/lib/queries/players";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import { toViewRows } from "@/lib/ranking/view";
import { RankingTable } from "@/components/RankingTable";
import { describeFormat, describeScoring } from "@/lib/describe";
import { formatDateTime } from "@/lib/format";
import type { LevelRow } from "@/types/db";
import type { RankingViewRow } from "@/lib/ranking/view";

/**
 * Página pública de um ranking — ESTÁTICA (gerada na build ou na primeira
 * visita) e atualizada somente por revalidatePath quando:
 *  - um resultado é confirmado/corrigido/removido;
 *  - a configuração do nível muda;
 *  - o administrador publica manualmente.
 * Nenhuma consulta por visita, nenhum cron, nenhum polling.
 */

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
      description: `Classificação publicada do nível ${level.name}.`,
    };
  } catch {
    return { title: "Classificação" };
  }
}

async function loadData(slug: string): Promise<
  | { kind: "error" }
  | { kind: "empty"; level: LevelRow; message: string }
  | { kind: "ok"; level: LevelRow; rows: RankingViewRow[]; computedAt: string; matchesCount: number }
  | { kind: "notfound" }
> {
  try {
    const anon = createSupabaseAnon();
    const level = await getPublicLevelBySlug(anon, slug);
    if (!level) return { kind: "notfound" };

    const snapshot = await getSnapshot(anon, level.id);
    const entries = Array.isArray(snapshot?.data?.entries)
      ? snapshot.data.entries
      : null;
    if (!snapshot || !entries || entries.length === 0) {
      return {
        kind: "empty",
        level,
        message: "A classificação deste nível ainda não foi publicada.",
      };
    }

    // Hidratação de nomes em uma única consulta (chunk de 100 ids).
    const names = await hydrateNames(
      anon,
      entries.map((e) => e.id),
    );
    return {
      kind: "ok",
      level,
      rows: toViewRows(entries, names),
      computedAt: snapshot.computed_at,
      matchesCount: snapshot.data.mc ?? 0,
    };
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
          <p className="muted">{data.message}</p>
          <p className="small">
            <Link href={`/rules`}>Ver regras deste nível</Link>
          </p>
        </div>
      </>
    );
  }

  const { level, rows, computedAt, matchesCount } = data;

  return (
    <>
      <h1 className="page-title">
        {level.name} <span className="muted small">({level.code})</span>
      </h1>
      <p className="page-sub">
        <Link href="/rules">Regras</Link> ·{" "}
        <Link href={`/results/${level.slug}`}>Resultados</Link> ·{" "}
        {describeFormat(level.config)} {describeScoring(level.config)}
      </p>

      <RankingTable rows={rows} />

      <p className="muted small mt center">
        {matchesCount} partida{matchesCount === 1 ? "" : "s"} confirmada
        {matchesCount === 1 ? "" : "s"} · atualizado em{" "}
        {formatDateTime(computedAt)}
      </p>
    </>
  );
}
